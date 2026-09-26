# AI Search (`ai_search`) — how it works

## One-line summary

AI Search is an **agentic loop in `ai-service`**, not a search index: the LLM gets
Graph-backed tools and decides which searches to run. The only genuinely paginated
Graph endpoint underneath is `POST /search/query` (`from`/`size`).

---

## Architecture — where things live and why

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ RENDERER  (src/renderer)                                    browser, per-tab │
│                                                                              │
│  search box ── handleSearchChange ──> isAIQuery()  "please…" + ai_search perm│
│  AppWithNavigation.tsx:9736                │                                 │
│                                            ├─> createPartition(ai-search-N)  │
│                                            │   (empty panel, instant)        │
│  Enter ─────> performAISearch :8681        │                                 │
│                 ├─ detectAISearchScope     │  partition/group name in query  │
│                 ├─ syncFolder (race 5s)    │  freshen local cache            │
│                 ├─ scanCtrl.expand(500,10s)│  deepen local scan              │
│                 └─ aiService.search(...)   │                                 │
│                                                                              │
│  AISearchPartition.tsx  <── bus('ai-search:progress' | ':content-delta')     │
│     md.render + DOMPurify ──> [[N]](email:<id>) anchors ──> click: reading    │
│                                                     dblclick: popout window  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │  POST /ai/ai-search   (bearer, 120s)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ BACKEND  (backend/aiServiceRoutes.ts:1374)                        port 3001  │
│   • authenticates → userId = req.user.email                                  │
│   • hard-validates scope/history/citations (size + shape caps)               │
│   • registerUser(userId, accessToken)  → hands ai-service a fresh Graph token│
│   • proxies, passing SSE straight through                                    │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ AI-SERVICE                                                        port 3002  │
│                                                                              │
│  search/routes.ts        SSE framing, re-validation, LLM_STREAMING setting,  │
│                          tier = 'medium' (user is waiting)                   │
│        │                                                                     │
│  search/engine.ts        SEARCH_ENGINE: 'copilot' | default 'claude'         │
│                          builds system prompt (cached prefix / uncached       │
│                          suffix), assembles tools, callAnthropic(maxTokens    │
│                          4096) under withUsageContext({operation:'search'}),  │
│                          owns the citations map + [N] → link rewrite          │
│        │                                                                     │
│  search/tools.ts         search_emails · search_teams_messages · read_email  │
│                          · read_thread · read_wiki_page · list_scoped_emails │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    ▼
                    Microsoft Graph  (shared/graph/graphClient)
```

### Why each piece sits where it does

| Piece | Lives in | Why not elsewhere |
|---|---|---|
| `please` detection | renderer, per keystroke | Must be free (<16ms keystroke budget) and must decide *locally* whether to leave the query on the fast local-FTS5 path. A server round-trip to classify the query would cost more than the local search itself. |
| Empty partition on detection | renderer | Perceived performance: panel on screen before any request exists. Same reason skeletons beat spinners. |
| Scope detection + sync/expand | renderer | The partition definitions, scan controllers and RxDB cache are all client-side. The server has no notion of "the user's Ops partition". |
| Validation | backend proxy *and* ai-service | ai-service trusts no caller: the backend is the primary gate, ai-service repeats it as defence-in-depth (comment says so explicitly in `routes.ts`). |
| Graph token | backend → `registerUser` | Tokens are encrypted at rest in the backend (AES-256-GCM); ai-service never holds MSAL state, it borrows a registered token. |
| Agentic loop | ai-service, not backend | Keeps LLM latency, cost tracking and the Agent-SDK dependency out of the request-serving backend. ai-service is separately scaled and separately deployable. |
| Citation map | ai-service engine | Numbers must stay stable across multi-turn follow-ups; the engine is the only place that sees every tool result in a run. |
| `[N]` → `[[N]](email:<id>)` rewrite | ai-service engine | The renderer shouldn't have to parse model output. It just sanitizes markdown and delegates clicks. |
| Progress via `bus`, not partition state | renderer | Deliberate bypass of the partition-state → `useMemo` chain so per-token deltas don't re-render the whole list. Noted in the component. |

---

## Pipeline, step by step

### 1. Keystroke — `"please…"` detected

`handleSearchChange` (`src/renderer/AppWithNavigation.tsx:9736`):

- `aiService.isAIQuery(q)` = `q.trim().toLowerCase().startsWith('please')`
  (`src/renderer/services/aiService.ts:169`), gated on the `ai_search` permission
  (`aiSearchPerm.effective`). Feature off → query stays a normal search.
- First detection immediately creates an empty `type: 'ai-search'` partition
  (`ai-search-<n>`, `loading: false`). Deleting `please` removes the pending partition.
- **No network on keystroke.** The request waits for Enter.

### 2. Enter — `performAISearch` (`AppWithNavigation.tsx:8681`)

Wrapped in `runInteraction({ userAction: 'ai.invoke', trigger: 'keyboard' | 'click',
targetElement: 'global_search_input' })` for interaction logging.

1. **Scope detection** — `detectAISearchScope(query)` matches partition titles, then
   group labels from that partition's `groupingRules`, against the query text
   (longest match wins). Title becomes `AI: <query> (in <Partition > Group>)`.
2. **Reuse the pending partition** (or create one); `loading: true`; clear prior
   `aiQuery` / `aiChatMessages` / `aiCitations`.
3. **If scoped**, freshen local data first — all best-effort, all non-fatal:
   - `syncFolder(sourceFolderId)` raced against a 5s timeout
   - `scanCtrl.expand(500, 10000)` — up to 500 more rows, 10s cap
   - re-read partition emails → `buildScopeFromEmails(...)` →
     `{ partitionTitle, groupLabel, emails[], oldestScannedDate, scanFinished }`
   - progress strings (`"Syncing latest emails..."`, `"Loading partition history..."`)
     go straight onto the bus
4. `authService.getAccessToken()` → `aiService.search(query, token, { scope,
   onProgress, onContentDelta })`. **Passing `onProgress` is what sets `stream: true`.**

### 3. Transport

`POST {API_BASE_URL}/ai/ai-search`, bearer token, `AbortSignal.timeout(120000)` —
agentic queries get 120s, the longest client timeout in the app.

**Backend proxy** `backend/aiServiceRoutes.ts:1374` (`handleAiSearch`):
`userId = req.user.email`; validates `scope.emails` ≤200 entries with per-field length
caps, `history` ≤20 entries ≤50KB each, `citations` keys `/^\d+$/` and values
Graph-ID-shaped; best-effort `aiService.registerUser(userId, …, accessToken)`; proxies
with SSE pass-through.

**ai-service route** `ai-service/src/search/routes.ts` (`handleSearch`): repeats the
validation, sets `text/event-stream` + `flushHeaders()`, reads the `LLM_STREAMING`
setting to decide whether to forward content deltas, calls
`search(userId, query, onProgress, history, citations, onDelta, scope, 'medium')`.

### 4. The agentic loop (`ai-service/src/search/engine.ts`)

- `SEARCH_ENGINE` setting: `'copilot'` → M365 Copilot Chat API; anything else →
  Claude path with Graph tools.
- Tools: `search_emails`, `search_teams_messages`, `read_email`, `read_thread`, plus
  `read_wiki_page` (`buildWikiContext`, bounded to 2s so store latency never blocks a
  search) and `list_scoped_emails` when a scope arrived. Every handler is wrapped to
  emit a progress string.
- Non-fatal pre-fetches: `buildContextEnrichment` (user/company identity) and
  `getFolderMap` (`GET /me/mailFolders`, cached 10 min per user) so the prompt can list
  valid `folder` values.
- `buildSearchSystemPrompt(...)` — cached prefix (strategies, citation rules) vs
  uncached suffix (folder list, wiki index, scope caveat incl. `oldest loaded: <date>`
  when the scan didn't finish). A test pins that `# Available Folders` never leaks into
  the cached prefix.
- `callAnthropic({ system, prompt: query, history, tools, maxTokens: 4096 })` inside
  `withUsageContext({ userId, operation: 'search' })` for cost attribution.
- Each returned email is assigned the next number in the shared `citations` map.

### 5. Which Graph calls it iterates

`search_emails` compiles filters into **one** KQL string — `query`, `subject:"…"`,
`from:`, `participants:`, `received>=`, `received<` — then takes one of two branches
(`ai-service/src/search/tools.ts:159-233`):

1. **No folder filter → `POST /search/query`** (Microsoft Search API,
   `entityTypes: ['message']`). **This is the paginated one:** tool `limit`/`offset` map
   to `size` (clamped 1-50) and `from`. Folder map is fetched in parallel; hits are
   normalised from `hitsContainers[0].hits` into Messages-API shape.
2. **Folder filter → `GET /me/mailFolders/{id}/messages?$search="<KQL>"&$top=<size>&$select=…`**
   Folder scoping happens at the endpoint, not in KQL, because KQL `folderid:` doesn't
   work on `/search/query`, and post-filtering a relevance-ranked page silently drops
   in-folder hits. `$skip` doesn't combine with `$search` here, so **`offset` is silently
   ignored on the folder path** — the tool schema tells the model to narrow instead.

Supporting calls:

| Tool | Graph |
|---|---|
| `search_teams_messages` | `POST /search/query` with `from`/`size` |
| `read_email` | `GET /me/messages/{id}` |
| `read_thread` | `GET /me/messages/{id}?$select=conversationId`, then `GET /me/messages` filtered by `conversationId`. Uses the presence of `@odata.nextLink` only as a `truncated: true` flag — it does **not** follow it. |
| `getFolderMap` | `GET /me/mailFolders`, cached 10 min per user |
| `list_scoped_emails` | none — pages the client-supplied scope in memory |

So: **the model does the iterating**, by issuing repeated `search_emails` calls with
different filters. Graph-level pagination exists only on `POST /search/query`.

### 6. Streaming back

Three SSE event types, each `data: {...}\n\n`, terminated by `data: [DONE]`:

- `progress` → `bus.emit('ai-search:progress', { partitionId, … })`
- `content_delta` → `bus.emit('ai-search:content-delta', …)`; the **first** delta records
  `metricsService.recordValue('search_seconds', …, { source: 'ai' })` — latency to first
  rendered token, not to completion
- `result` → `{ response, toolResults, citations }`

On resolution `performAISearch` writes `loading: false`, `aiQuery`, `aiChatMessages`,
`aiCitations`, `aiScope`. Failure substitutes a fixed "AI search is currently
unavailable" message.

### 7. Render and open

- Before returning, the engine rewrites every `[N]` into `[[N]](email:<graphMessageId>)`,
  plus a safety net for stray `[[prefix--slug]]` wiki refs.
- `AISearchPartition` renders via `md.render` + `DOMPurify.sanitize` with an
  `ALLOWED_PROTOCOLS` URI regexp, memoized per message so re-renders don't re-sanitize.
- Delegated click handling on the content container:
  - single click (250ms timer, to allow double-click detection) → `onSelectEmail(emailId)`
    → reading pane
  - double click → `emailWindowService.openEmailWindow(emailId, …, mailboxId ??
    graphService.getSelfMailboxId())` — mailbox-scoped, because citation IDs are
  - `emailId` re-validated against `/^[a-zA-Z0-9._\-=+/]+$/` on both paths

### 8. Follow-ups

`handleAIChatSubmit` replays the turn with `history` (original `aiQuery` + all chat
messages, assistant content through `stripCitationLinks` so the model sees plain `[N]`)
and the accumulated `aiCitations`, so citation numbers keep pointing at the same
messages across turns. Progress messages are snapshotted per turn so earlier tool
traces stay visible.

---

## Things worth flagging

- **Latency:** AI search is ~2-5s against the repo's <300ms local-search budget. It is a
  deliberately separate path, only reachable behind the `please` prefix — not a
  replacement for local FTS5 search.
- **The 120s client timeout** is the longest in the app. A hung Graph call inside the
  agentic loop holds the partition in `loading` for its full duration, with only progress
  strings as feedback.
- **Folder-path pagination is a silent no-op.** `offset` on a folder-scoped
  `search_emails` is dropped; correctness depends entirely on the model reading the
  schema description and narrowing instead.
- **Concurrent sessions:** the partition id is `ai-search-<n>` from a per-window counter
  (`aiSearchCounterRef`), and progress is delivered on the in-window `bus`. Nothing is
  coordinated across tabs — which looks fine (each window runs its own search) but I
  didn't find it written down anywhere per the CLAUDE.md checklist item 4.

### Known doc drift

`docs/developer/features/ai-integration.md` is written in first-person changelog voice
("I've successfully integrated…") and still describes a two-tool Claude Agent SDK
surface. It doesn't match `engine.ts`'s current five-to-six tools, the Copilot branch,
wiki access, or scoped-partition mode. Fix via `/DevDocs` when touching this area.
