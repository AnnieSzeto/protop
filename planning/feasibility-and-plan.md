# Email → Pricing Bot: Feasibility & Plan

Assessment of `specifications.md`. Greenfield — no code yet.

## Difficulty per step

### 1. Read emails via IMAP — Easy (~1 day)
The domain supports IMAP, so this is stdlib territory (`imaplib` + `email` in Python,
or `imapflow` in Node). Real work is auth config, attachment handling, and tracking
which messages have already been processed (store UIDs — don't rely on the "unread"
flag, humans will mark things read).

### 2. Read/interpret the existing pricing spreadsheet — Easy-to-Medium (1–3 days)
`openpyxl` reads it fine. Difficulty is entirely about *this specific sheet*:

- Clean table with a header row (part no., description, price, supplier, date) → trivial.
- Merged cells, one sheet per supplier, margin notes, pivot-ish layout → fiddliest
  part of the whole project.

**This is the one thing to look at before committing to a design.**

### 3. Semantic search over emails ("when was XX pricing decided?") — Medium (3–5 days)
Well-trodden path: pull mail into a local store, chunk, embed, retrieve top-k, hand to
an LLM with citations back to message IDs. Only medium because the corpus is small and
domain-narrow.

Shortcut worth taking: for a mailbox under ~50k messages, **SQLite FTS5 full-text search
plus part-number matching** gets most of the way and is far easier to debug than a vector
store. Add embeddings only once keyword search visibly fails.

### 4. Auto-update the spreadsheet from incoming emails — Hard (the real work, 2+ weeks)
This is where the project lives or dies, and the difficulty is *extraction reliability*,
not code. Supplier price emails are messy:

- prices inside PDF attachments, or scanned images
- "as discussed, add 3%"
- tiered pricing (100+ units vs 1000+), differing currency and MOQ
- supplier part numbers that don't match internal SKUs
- quotes vs. confirmations vs. invoices

An LLM handles maybe 80–90% of these well. The remaining 10% is *wrong prices silently
written into the file the business quotes from.*

Mitigation is design, not a better model: **never let the bot write directly.** It
produces proposed changes with a confidence score and a link to the source email; a human
clicks to apply. That reframes the hard problem from "be correct" to "be a good first
draft," which is achievable.

### 5. History log — Easy (~1 day)
Append-only table: timestamp, part number, old price, new price, source message ID, who
approved. Keep this in SQLite, not in an Excel tab.

## Phased plan

**Phase 0 — look at the data (before writing code).**
Sample of the real spreadsheet + ~20 representative price emails. Everything below is
shaped by those two things; guessing here is the main way this project wastes a month.

**Phase 1 — ingestion, read-only.**
IMAP connector → local SQLite mirror of messages and attachments. No parsing, no writing.
Verify it can run for a week without duplicating or missing mail.

**Phase 2 — the query feature (step 3).**
Search on top of that mirror. Ship this *second*, not last: useful on its own, zero risk
of corrupting data, and it forces the email store to be correct.

**Phase 3 — extraction as proposals (half of step 4).**
LLM extracts `{part, new_price, currency, effective_date, source_msg_id, confidence}`.
Output goes to a review queue — a table a human reads, not the live sheet. Run in parallel
with the current manual process for a few weeks and *measure* how often it's right. That
measurement is what decides whether it can be trusted.

**Phase 4 — apply + log (rest of step 4, and step 5).**
Approved proposals write to the spreadsheet (always a timestamped copy, never in-place on
the only file) and append to the history log. Auto-apply for high-confidence cases only
after Phase 3 produces real numbers.

## Flags

**Excel as system of record is the weak link.** Concurrent access, someone having the file
open in Excel while the bot writes, no transactions, no real audit trail. With multiple
users this becomes decisive — see the export/import design below, which keeps humans
editing a real spreadsheet without the lost-update problem.

**Credentials.** IMAP/SMTP password in env vars or a secret store, never in the repo. If
the host offers app-specific passwords, use one scoped to this bot.

---

# Elaboration: hosting, cost, and where things run

**Scope correction (revised):** this is a **multi-user** tool. Every user with a
`name@domain` address can read and write the spreadsheet and the change log (and therefore
the shared DB). Email search, by contrast, is **per-user** — each person searches only
their own mailbox. That split drives most of what follows.

## What multi-user actually forces

One clarification first, because it's the most common misconception about SQLite: SQLite
handles concurrent *users* fine. What it does not handle is concurrent access **from
multiple machines over a network share** (SMB/NFS file locking is unreliable, and
OneDrive/Dropbox-style sync clients will corrupt a database mid-write).

The distinction that matters is therefore not "SQLite vs. MySQL" — it's **how many
processes touch the file**:

- **One server process, many users** → SQLite is fine. Users talk to the app; only the app
  touches the file. Enable WAL mode and it comfortably handles this workload.
- **Many client processes, one shared file** → broken, regardless of engine. Do not do this.

So the real consequence of multi-user is not a database change. It is that **something must
be always-on to be that one process.** Multi-user means a server.

## Hosting: this is now required

| Option | Cost | Viability |
|---|---|---|
| **Small VPS** (Hetzner/DO/Lightsail), app + SQLite + scheduled poller | ~$5–10/mo | **Recommended.** Full control, one process owns the DB, trivial backups |
| **Existing host: Plan C ×3 (PHP + MariaDB)** | $0 extra (already paid) | **Confirmed available.** Means writing the app in PHP; viable if the checks below pass |
| Office PC as the server | $0 | Works only if it is never off, never sleeps, and has a stable address. Fragile |

**Update 2026-09-26:** the account is confirmed to be **Plan C ×3 web hosting** (DirectAdmin,
FTP, PHP, MariaDB), not static hosting. The earlier "static website hosting" row was based
on a wrong assumption and has been removed. Shared hosting still can't run long-lived
processes, so the poller would be a cron job; see "Host capability check" at the end for
what still needs confirming.

**Recommendation:** use the existing Plan C ×3 hosting if the three checks in "Host capability check" pass (database size cap, cron, outbound HTTPS). Otherwise **a small VPS, Python app, SQLite in WAL mode.** Migrate to MySQL only if
you outgrow it, which at this scale you won't. Keep DB access behind one module so the swap
stays cheap.

## Authentication: reuse the mail server

Don't build a user table. "Anyone with a `name@domain` mailbox" has a clean implementation:
the user enters their email and mail password, and the app attempts an **IMAP login**
against the mail server. Success *is* authentication — it proves both that the account
exists and that the password is right, with no password storage and no separate account
admin. Deprovisioning is automatic: a mailbox that's disabled can no longer log in.

Two consequences:

- Those same credentials are what per-user email search needs anyway, so this costs nothing
  extra. Hold them in the encrypted server-side session for the session's lifetime; don't
  persist them to disk.
- This makes TLS on the app mandatory, not optional — users are typing their real mail
  password into it. Caddy or nginx with Let's Encrypt, HTTPS only.

If the host supports app-specific passwords, prefer those.

## Per-user email search vs. shared pricing data

These are two different data domains with different access rules, and the schema should
make that structural rather than a filter someone can forget:

**Shared (all authenticated users read/write):** the price list, the change log, the
proposal queue. One copy, everyone sees the same thing.

**Per-user (strictly isolated):** the email mirror and its search index. Every message row
carries an `owner` column, and every query is scoped by the session's user. Treat a missing
owner filter as a security bug, not a nicety — this is someone's private mailbox.

One design point that needs a decision: when the bot extracts a price change from Alice's
email, the *proposal* is shared but the *source email* is private. So the change log can
cite a message Bob is not allowed to open. The reasonable handling is for the log to store
enough denormalized context to be auditable on its own — subject line, sender, date,
quoted price snippet — plus a link that only the owner can follow. Bob sees "price changed
per email from supplier X on 3 Sep, quoted $4.20"; Bob cannot read Alice's inbox. Worth
confirming this is the behaviour you want, since the alternative (any user can open any
cited email) is a real policy choice and not obviously wrong for a small team.

## Keeping Excel human-editable — revised for multi-user

The single-user plan had `prices.xlsx` as the authoritative file with the bot reconciling
around it. **With several people editing, that no longer holds.** Two users opening the
same file from a share produces last-write-wins and silently lost edits — before the bot is
even involved. This is an existing problem with a shared spreadsheet, not one the bot
introduces, but the bot would make it worse.

So the roles flip:

- **The database is the source of truth for prices.** All writes go through the app, which
  gives you row-level updates, real transactions, and a complete audit trail.
- **Excel becomes the human interface — export and import, not the live store.**

Concretely:

1. **Export:** any user downloads `prices.xlsx`, generated fresh from the DB, stamped with
   the revision it came from.
2. **Edit:** they change it in Excel, freely, offline. Nothing is locked.
3. **Import:** they upload it back. The app diffs against the revision it was exported from
   and shows exactly what changed before committing — with real conflict detection: if
   someone else changed a row in the meantime, that row is flagged rather than overwritten.
4. **Commit:** accepted changes land in the DB and the change log with `source: manual` and
   the user's identity.

This preserves what you actually want — humans editing a real spreadsheet, not typing into
web forms — while removing the lost-update problem. It also unifies nicely with the bot
path: a bot-extracted price and a human-edited cell arrive at the same review-and-commit
step, so there's one code path and one log.

If editing directly in a live shared sheet is a hard requirement, the only thing that
genuinely supports concurrent editing is Excel Online / Google Sheets, where the
spreadsheet becomes the multi-user store and the bot writes via the Microsoft Graph or
Sheets API. That's a different (and larger) integration, and it depends on whether you have
M365. Worth raising as a fork in the road rather than assuming.

## Does the LLM need to be constantly running or hosted?

**The LLM itself needs no hosting.** With the Claude API the model runs on Anthropic's
infrastructure — an HTTPS request, per-token billing, nothing idling between calls. A
self-hosted local model would be the opposite (GPU, always-on, real hardware cost) and
isn't worth it here: extraction from messy supplier email is exactly where a frontier model
earns its keep, and the volume is far too low for API cost to matter.

**The poller is a different question, and multi-user changes the answer.** Because search is
per-user, polling N mailboxes needs stored credentials for each — and storing everyone's
mail password server-side is a meaningfully worse security position than holding one bot
password. Options:

1. **A dedicated bot mailbox** (`pricing-bot@domain`) that suppliers are CC'd on, or that
   users forward price emails to. The poller runs continuously against *one* mailbox with
   *one* credential. Per-user search then works on-demand under the user's own session, with
   nothing stored. **This is the clean design** — it keeps the always-on component away from
   personal mailboxes entirely.
2. **Per-user background polling.** Needs each user's credentials at rest (encrypted, with a
   real key-management story). More capable — it catches price emails nobody thought to
   forward — but it's a much bigger security surface. Only worth it if option 1 demonstrably
   misses things.

Either way the poll cadence is relaxed: hourly during business hours is plenty, and IMAP
keeps mail on the server so a missed window costs nothing.

**Running cost, all in:** ~$5–10/mo VPS, a few dollars a month in API calls at ~50 price
emails/day, $0 for the LLM itself. Build time still dominates.

## Revised plan deltas

Phases 0–4 above stand, with these changes:

- **Phase 0** additionally: confirm the Plan C ×3 limits (database size cap, cron, outbound HTTPS), decide bot-mailbox vs.
  per-user polling, and confirm the cross-user email-citation policy.
- **New Phase 1.5 — server + auth.** Server (existing host or VPS), HTTPS, IMAP-backed login, per-user data
  isolation. This has to land before anything multi-user, and it's ~3–5 days.
- **Phase 2** (search) is now per-user scoped from the start — retrofitting isolation later
  is how private mail leaks.
- **Phase 4** becomes export/import/diff against the DB rather than in-place Excel writes.
  Slightly more work, but it removes the file-locking and lost-update problems rather than
  managing them.

Net effect: roughly a week of additional work, and hosting moves from optional to required.

## Open questions to confirm

1. **Spreadsheet structure** — a real sample. Still blocks Phase 0.
2. ~~**Mail server specifics**~~ **Answered:** IMAP `protopintl-com.login.hk:993`, SMTP port 465/587 (see `domain-info.md`). Still open: app-specific password support.
3. ~~**PHP/MySQL** — does PHP *execute* on the plan?~~ **Answered:** yes, PHP 8 + MariaDB,
   on Plan C ×3; no persistent processes. Per-database size cap still to confirm. See the host capability
   section at the end.
4. **How many users**, and do they need to review proposals simultaneously?
5. **Bot mailbox or per-user polling** — see above; affects the security model most.
6. **Cross-user email citations** — can any user open a cited email, or owner-only?
7. **M365 / Google Workspace?** Decides whether live shared-sheet editing is even on the table.
8. **Volume** — price emails per day, mailbox size (decides FTS5 vs. embeddings).

---
# Host capability check: website-solution.net

**Full provider specs and our account details live in `domain-info.md`.** Updated
2026-09-26 with the confirmed plan. Only the architecture-relevant conclusions are here.

## Confirmed

- **Plan: Plan C ×3 web hosting** (renewed), with domain registration. Real shared
  hosting — DirectAdmin, FTP, PHP 8, MariaDB, phpMyAdmin. The earlier "static hosting /
  website builder" assumption was wrong.
- **We can create our own databases and tables.** Plan C ×3 likely allows ~12 databases
  (estimate: 3 × Plan C's 4).
- **PHP is the only server-side language** (no Python, no Node), and **no SSH**.
- **No persistent processes** — the poller must be cron-driven.
- **Mail servers:** IMAP `protopintl-com.login.hk:993`, SMTP port 465 (SSL/TLS) or 587
  (STARTTLS). SmarterMail 2FA offers app-specific passwords.
- **Disk is shared** across email + website + database (~120 GB estimated on ×3);
  backups kept only ~5 days.
- **Their VPS is HK$728/mo** — technically ideal (root, SSH) but ~10–20× a commodity VPS.

## Still to check (in DirectAdmin)

These three decide whether the existing hosting is enough:

1. **Size cap per database.** 200 MB on the published plans; unknown for ×3. If it's still
   200 MB, email bodies can't be stored in the database.
2. **Cron jobs** — present under Advanced Features? Minimum interval? Hourly is enough.
3. **Outbound HTTPS from PHP** (cURL) — required for Claude API calls. Upload a
   `phpinfo()` test page to check.

## What this means for the architecture

Two viable shapes, in order of preference:

**1. Existing hosting (Plan C ×3), PHP + MariaDB. $0 extra — preferred if the checks pass.**
- **Database size.** If the cap is several GB, the design in the sections above works
  largely as written (with MariaDB instead of SQLite). If it's 200 MB: store only headers,
  extracted prices and message *references*, and re-fetch bodies from IMAP on demand for
  search. Slower and more complex search, but workable. Multiple databases (e.g. one for
  shared pricing data, one per-user email index) help spread the load.
- **PHP only.** Claude API extraction is just HTTPS calls, so this is fine; email parsing
  and any embedding work are more awkward than in Python.
- **Cron-driven poller.** Hourly is fine for this workload.
- **Shared disk** means the email index competes with mail storage.

**2. External VPS (~US$5–10/mo) + email stays here. Fallback.**
Python, SQLite in WAL mode, no size ceiling, real cron, full control. Use this if the
checks above fail or PHP proves too limiting. Mail is reached over IMAP from anywhere.

(Their own VPS at HK$728/mo only makes sense for single-vendor support or HK data
residency.)

## Revised cost picture

| Shape | Recurring | Notes |
|---|---|---|
| Existing Plan C ×3 + existing email | $0 extra + a few US$/mo API | Preferred if checks pass |
| External VPS + existing email | ~US$5–10/mo + a few US$/mo API | Fallback |
| Their VPS + existing email | HK$728/mo + API | Only for vendor/residency reasons |

Hosting and email are already paid for. LLM inference remains per-token with nothing to host.
