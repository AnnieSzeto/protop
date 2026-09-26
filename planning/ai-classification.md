# AI Classification (RokMail)

## Summary

Classification is **fully server-side and background**. It lives in the
standalone `ai-service` (port 3002), is driven by Microsoft Graph change
notifications on *server-owned* subscriptions, and authenticates with **stored
OBO refresh tokens** rather than the browser session. Mail arriving while every
tab is closed still gets classified; the frontend is only a consumer of results
(pushed over WebSocket) and the thing that handed over the refresh token at
login.

LLM calls go through the RCM LLM Gateway via the native `@anthropic-ai/sdk`,
default model `claude-haiku-4-5-20251001`, always with tool-use structured
output (never prompt-instructed JSON).

## Architecture — where things live and why

| Path | Role |
|---|---|
| `ai-service/src/shared/auth/routes.ts` | `/register` — backend hands over the user's refresh token at sign-in |
| `ai-service/src/shared/graph/graphClient.ts` | OBO token refresh, per-user access-token cache + refresh mutex, `getCachedAccessToken` (cache-only) |
| `ai-service/src/subscriptions/subscriptionManager.ts` | Creates/renews per-folder Graph subscriptions (24h expiry, renew at T-30min) |
| `ai-service/src/subscriptions/eventHubConsumer.ts` | Reads Graph notifications from Azure Event Hubs on its own consumer group |
| `ai-service/src/subscriptions/webhookRoutes.ts` | Routes a notification to a registered user, enqueues the job |
| `ai-service/src/pipeline/emailProcessingQueue.ts` / `emailProcessingWorker.ts` | BullMQ queue + worker, rate gates, retries |
| `ai-service/src/pipeline/emailPipeline.ts` | `processEmail` — the orchestration of skip gates, fetch, parallel arms, Exchange write, notifies |
| `ai-service/src/classification/orchestrator.ts` | `classifyAll` — system (batched) + user (per-prompt) LLM calls |
| `ai-service/src/classification/{engine,promptBuilder,systemPromptBuilder,store}.ts` | Per-email classify, prompt construction, Postgres persistence |
| `ai-service/src/pipeline/backfillService.ts` | 48h auto/catch-up backfill over a folder + date range |
| `ai-service/src/pipeline/batchJobStore.ts` / `batchDateCompletionWorker.ts` | User-initiated batch job state + BullMQ flow completion |
| `backend/batchJobController.ts` / `batchJobProcessor.ts` | **Backend-side** drive loop for user-initiated batch jobs |

Why it's shaped this way:

- **Separate service, separate consumer group.** The ai-service subscribes to
  Event Hubs on its own consumer group (`ai-service`, not the backend's
  `$Default`), so backend and ai-service each receive every notification
  independently and neither starves the other.
- **Refresh tokens server-side.** This is the whole reason background work is
  possible. `register` with only an access token calls `ensureRegistration` and
  caches the token in memory but deliberately **never overwrites a stored
  refresh token** — doing so would break background jobs.
- **Exchange is the source of truth for "already processed."** The
  `AI_SUMMARY_CATEGORY` category on the message is the idempotency signal, not
  local state. Backfill also finds unprocessed mail by Exchange category filter
  rather than a local table.
- **Domain-based layout.** Each feature co-locates services, routes, stores and
  tests; `shared/` only holds what 3+ domains import.

## Pipeline

**Setup (once, at sign-in)**

1. User signs in → mail backend POSTs `ai-service /auth/register` with the
   refresh token; it's stored server-side.
2. Registration fires `resubscribeForUser` → a Graph webhook subscription per
   monitored folder. A BullMQ maintenance worker renews them 30 min before the
   24h expiry, using the stored refresh token — so subscriptions persist with
   no user present.

**Per incoming email**

3. Graph delivers the notification to **Azure Event Hubs** (the only supported
   notification path); `eventHubConsumer` reads it.
4. Route to a registered user: normally by `subscriptionId`; otherwise an
   OID→userId probe with a 1h cache. The *folder* is deliberately not cached —
   a mailbox has many subscribed folders, so it's re-derived per message from
   `parentFolderId`.
5. Enqueue into BullMQ/Redis (3 attempts, exponential backoff). Enqueue is
   awaited before responding — Redis down ⇒ HTTP 500 ⇒ Graph retries the batch.
6. Worker picks it up (`EMAIL_WORKER_CONCURRENCY`, default 3) behind two gates:
   the shared Graph 429 pause (reschedule past it rather than grind a throttled
   mailbox) and a per-user classification token bucket (starved jobs rescheduled
   ~60s + jitter; no-op skips are refunded; batch jobs bypass it entirely).

**`processEmail`**

7. **Idempotency** — `isEmailProcessed` via the Exchange category. Duplicate
   webhook ⇒ skip.
8. **Feature gate** — `effective = granted && enabled`; every AI feature is off
   by default, and a newly-granted user stays off until they opt in.
9. **Fetch body** once. Graph 404 (deleted between webhook and fetch) = benign
   skip; 429 = emit failure *and* rethrow so BullMQ retries.
10. **Folder validation** for webhook/backfill sources; OID-fallback
    notifications are validated here against the monitored-folder list, and
    deliberately status-agnostic so a transiently pending subscription can't
    cause a silent skip.
11. **Thread history + context enrichment** fetched once, shared by all arms.
12. **Three arms in parallel**: classification (`classifyAll`), summarization,
    wiki-delta extraction. Inside `classifyAll`, system classifications are one
    batched LLM call and each user prompt is its own call; both produce the same
    `{ values, confidence }` shape.
13. **Early push.** The classification arm persists to Postgres *before*
    resolving, then immediately POSTs backend `/internal/notify`
    (`knowledge_updated`) per promptId:topicId → WebSocket. This is what puts
    the email in its AI-topic partition without waiting for summarization,
    wiki extraction or the Exchange write.
14. **Single Exchange write** of summary + classifications + deltas, which also
    sets the idempotency category. Failure throws so BullMQ retries; the PATCH
    is idempotent.
15. If a summary exists, a *separate* summary-ready notify fires — after the
    write, so the frontend's extension fetch can't race it.

**Catch-up paths**

See "Existing / historical email" below — four entry points, all converging on
`processEmail` from the idempotency check onward.

## Existing / historical email

The webhook path above is **new mail only**. Existing mail enters through four
separate paths. They do **not** all run the same pipeline — see "Does batch
follow the same pipeline?" below.

### 1. Auto-backfill on subscription creation (48h)

`subscriptionManager.ts:383` fires `triggerAutoBackfill` fire-and-forget when a
folder subscription is created. Window is the **last 48 hours** only, deduped by
`getActiveBackfillJob`. Enabling a folder does *not* classify its whole history.

### 2. Catch-up backfill (the gap-closer, also 48h)

- `triggerCatchUpBackfills()` at ai-service startup (`server.ts:151`) — runs on
  **every** start with no minimum-gap threshold, deliberately, to catch mail
  that arrived during deploy windows, pod restarts and liveness-probe kills.
- `triggerCatchUpForUser(userId)` on WebSocket auth (`settings/folderRoutes.ts:31`).
- `retryBackfillJob` for a previously failed job.

This is the recovery path for dropped Event Hub notifications. Dedup is via
`getActiveBackfillJob` and **not** via `pipeline_log` history — a pre-existing
subscription with an empty log (e.g. post-migration) must still be caught up.

### 3. User-initiated batch jobs (arbitrary date range)

The real "classify my existing mail" feature, and the only path whose **drive
loop lives in the backend**, not the ai-service.

**How a user triggers it (not IT/admin — an ordinary in-app action):**

Folder tree → **"Manage AI classifications"** button
(`PartitionManageButtons.tsx`, rendered only when the user's *effective* AI
permission is on) → `/classifications` popout
(`AppWithNavigation.tsx:12791`) → `ClassificationPromptManager` → per-prompt
**rerun** action (`openRerunPopout`, ~line 275) → `/classification-rerun`
popout: a start/end date picker defaulting to **the last 7 days** → 
`startClassifyJob(...)` → `POST /batch-jobs/start`.

Rerun always sends **`forceReprocess: true`** — it is explicitly a *re*-classify,
so it skips dedup and re-pays for every LLM call in the range. A wide date range
is real money.

`TasksView` (job monitor: pause / resume / cancel / per-email results) is mounted
only under **Settings → Advanced → Dev Tools** (`AdvancedDevTools.tsx:190`), so
*starting* a job is a user action while *controlling* it is behind advanced
settings. Progress still reaches users over WebSocket.

⚠ `POST /batch-jobs/start` (`backend/server.ts:5162`) has **no `authMiddleware`**,
unlike its siblings `/batch-jobs/list` and `/active`. It takes `userEmail` from
the body, or base64-decodes `preferred_username`/`upn` out of the JWT **without
verifying the signature** — so `userId` there is caller-asserted on a
spend-triggering endpoint. Not changed; flagged.

**Server-side flow:**

1. `backend/batchJobController.ts` — `jobType: 'classify' | 'summarize'`,
   `promptId`, `startDate`/`endDate`, optional `forceReprocess`. One active job
   per user (409 otherwise). Job *state* is created in the ai-service
   (`batchJobStore`).
2. `backend/batchJobProcessor.ts` walks the date range (default concurrency 3),
   fetches each date's email IDs (`fetchEmailsForDate`), applies partition
   filtering, then `POST /batch-jobs/:id/enqueue-date`.
3. `enqueueBatchDate` creates a BullMQ **flow**: one child per email on
   `email-processing` (LOW priority, `jobId: batch-<jobId>--<emailId>` so
   enqueue is idempotent, 3 attempts, `removeOnComplete: false` so the parent
   can read `getChildrenValues()`, `ignoreDependencyOnFailure` so one dead child
   can't hang the parent) + a parent on `batch-date-completion`.
4. `batchDateCompletionWorker.ts` aggregates child results into the date's
   progress and **auto-completes** the job when all dates are terminal — that
   exists because the backend can be killed after the last date finishes but
   before it PATCHes the status.
5. Progress broadcasts to the UI over WebSocket; pause/resume/cancel/reset
   supported. `processJob` claims the job in `activeJobs` **before its first
   `await`** so a WS reconnect racing a manual resume can't double-drive it and
   double-charge the LLM.

Because the driver takes `accessToken` + `userEmail` as arguments, this path is
**tied to a live session** — unlike backfill and webhooks it doesn't progress
with the user fully gone (already-enqueued BullMQ children still drain).

### Does batch follow the same pipeline?

Partly. `emailProcessingWorker.ts:141` branches on `source === 'batch'` **before
the rate bucket**, into `processBatchEmail`, which forks again:

| | batch `classify` | batch `summarize` | webhook / backfill |
|---|---|---|---|
| Entry | `getOrClassifyEmail` (engine) | `processEmail`, `source: 'backfill'` | `processEmail` |
| Scope | **one prompt** the user picked | all arms | `classifyAll`: system batch + every user prompt |
| Dedup | Postgres `getEmailClassificationsByPrompt` | Exchange category | Exchange category |
| Exchange write | **none** (no `AI_SUMMARY_CATEGORY` set) | yes | yes |
| Early WS push | **none** | yes | yes |
| Summarization / wiki | no | yes | yes |
| Rate bucket | bypassed | bypassed | enforced (consume-then-refund-on-skip) |
| Pipeline-latency telemetry | no | no | yes |

So batch **classify** is the on-demand engine path at `tier: 'background'`, not
the pipeline. Notably it does *not* set the Exchange category, so a batch-classified
email is still "unprocessed" as far as backfill and the webhook idempotency check
are concerned.

Batch bypasses the rate bucket **deliberately**: a batch child runs under a
FlowProducer parent waiting on all children, and `moveToDelayed` would hang that
parent forever (`ignoreDependencyOnFailure` fires on failure, not on delay).
Batch is bounded by worker concurrency + per-user Anthropic spend limits +
Graph-tier slots instead. The shared **429 pause gate still applies** — it is
checked before the batch branch.

### 4. On-demand, single email

`POST /classifications/classify` with `{ emailId, promptId, forceReclassify }`
→ `engine.getOrClassifyEmail`, cache-first, `tier: 'medium'` (a user is actively
waiting), telemetry `source: 'on_demand'`. Bypasses `classifyAll` and the
pipeline entirely.

### Why re-running is safe

The webhook, backfill and batch-summarize paths dedupe on the Exchange
`AI_SUMMARY_CATEGORY` category rather than local state (batch-classify is the
exception — it dedupes in Postgres per prompt). Backfill applies the category as
a Graph **filter** — so
already-processed emails are excluded server-side and never fetched. Overlapping
backfills are cheap; `forceReprocess` is the explicit opt-out.

**Gap worth naming: nothing automatically classifies mail older than 48 hours.**
Deep history is only classified if someone starts a batch job for that range.

## Other things worth knowing

- **The "works logged out" caveat.** It holds only while the stored refresh
  token is valid. Revocation, CA policy, or ageing out stalls that user's
  background classification until their next sign-in — which is why `register`
  fires `resubscribeForUser` to recover failed/expired subscriptions on every
  login, not just new ones.
- **Telemetry.** `classification_run` events (plus webhook-arrival →
  classification-persisted latency) ship fire-and-forget to Kibana. Background
  paths read the token **cache-only** via `getCachedAccessToken` and must never
  trigger a refresh. `ok` events are sampled; failures are bounded by a
  per-`errorType` token bucket. No lint enforces the context-key allowlist —
  the only control is the `ALLOWED_CONTEXT_KEYS` unit test in each emitter.
- **Skip vs failure is a deliberate distinction.** Benign outcomes (draft,
  unmonitored folder, duplicate webhook, 404 race) are `skipped`; only a genuine
  inability to run (429, unexpected error) is a `failure`, so the headline
  failure rate stays meaningful. `errorType` is retained on skips for drill-down.
  Matching is on structured fields (status/code) only — never on error prose.
- **Per-category state is independent of the feature grant** and is not cleared
  when the grant flips; every system category is `enabledByDefault: false`, set
  in two places on purpose. The migration pair behind that has load-bearing
  details (apply order, lowercased `user_id`) — see
  `docs/developer/features/ai-feature-permissions.md`.
- **`classification/systemClassifications.json` is a runtime asset** — the
  Dockerfile copies it to `dist/`. A new runtime data file needs that `cp` too.
- **Per-user LLM spend attribution** rides on the `x-end-user` header (the
  signed-in user's UPN local part) on every gateway request.
- **Stale doc warning:** `docs/developer/features/ai-integration.md` describes
  an old "please"-prefixed AI search on the backend and has nothing to do with
  this pipeline. Don't take it as current.
