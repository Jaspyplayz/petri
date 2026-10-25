# Feedback board

Feature id: `feedback` · Route: `/feedback` · API: `POST /api/feedback`, `POST /api/feedback/:id/vote`, `POST /api/feedback/:id/report`

## What it does

Anonymous visitors post an idea or a bug (1–280 characters plus a category), upvote other items and report abusive ones. Each item shows its vote count, category, status (`new → triaged → building → shipped | rejected`) and a link to its issue or PR once the agents pick it up. The list sorts by **Top** (votes, then newest) or **Newest** via `?sort=top|new`.

## Invariants

- **Reads** use the anon key, which can only select public columns of rows where `hidden = false` (RLS + column grants). Hashed IPs are never readable.
- **Writes** go only through the route handlers in `server/handlers.ts`, which use the service role on the server. The anon key cannot insert, update or delete anything.
- Writes accept only same-origin `application/json` POSTs (403 cross-site via `Sec-Fetch-Site`/`Origin`, 415 otherwise), so a third-party page can't make visitors vote. Shared guard: `shared/lib/request-guards.ts`.
- Input is validated with Zod (trimmed body 1–280 chars, `idea | bug`); unknown keys like `status` are dropped. Request bodies over 4 KB get 413 without being fully read. The DB repeats the length rule as a CHECK.
- **Rate limits** per IP: 5 posts, 30 votes and 10 reports per rolling hour, enforced atomically by the `consume_rate_limit` RPC (`shared/supabase/rate-limit.ts`). IPv6 clients are bucketed by /64 for posts and votes and by /48 for reports. Over the limit returns 429 with `Retry-After`. The IP is stored only as `sha256(RATE_LIMIT_SALT + ":" + ip)`.
- The client IP comes from the first `x-forwarded-for` entry (Vercel overwrites this header, so it can't be spoofed in production). Locally it is client-controlled, which the e2e fixture uses to give each test its own rate-limit bucket.
- One vote per browser per item, so several people on one connection can each vote. The browser gets a random id in the `petri_voter` cookie (HttpOnly, SameSite=Lax, a year), stored only as `voter_hash = sha256(RATE_LIMIT_SALT + ":voter:" + id)` (`server/voter.ts`). A repeat vote is idempotent (200 `{ alreadyVoted: true }`, no count change), and the button shows as voted with "Already counted" under it.
- One connection can give an item at most 5 votes (`VOTES_PER_NETWORK_PER_ITEM`), so clearing cookies doesn't stuff the board; the 6th gets 409 `vote_limit`. The `cast_vote` RPC checks both and inserts under an advisory lock per (item, IP hash). Votes from before this rule used the IP hash as `voter_hash`, and their `ip_hash` is that same hash. Vote counts are maintained by a DB trigger.
- **Reports** count once per network per item, where a network is an IPv4 address or an IPv6 /48: `feedback_reports.reporter_hash` is the salted hash of that network, unlike votes, so one person can't hide an item by clearing cookies or by switching between the 65,536 /64s of a delegated /48. The report rate limit uses the same hash. A repeat report is idempotent (200 `{ alreadyReported: true }`). A DB trigger counts reports and sets `hidden` at 3 (`REPORTS_TO_HIDE`), which takes the item off the board and out of triage. Nothing in the app unhides an item. A maintainer does it in SQL by deleting the item's `feedback_reports` rows (the trigger lowers `report_count`) and then setting `hidden = false`; with the count left at 3, the next report would hide it again. The Report link asks "Confirm report" before it sends anything, and the second click of a double-click doesn't count as the confirmation.
- The board is fetched at request time inside `<Suspense>` (Cache Components); after a vote the client calls `router.refresh()`.
- **Kill switch flags** (`app_flags`, read through `shared/lib/flags-off-response.ts`, cached 30 s per server instance): `feedback_open = false` closes posting (503 `feedback_closed`, and the form becomes a note); `read_only_mode = true` closes posting, voting and reporting (503 `read_only`). The post area reads them at request time inside its own `<Suspense>`.

## Structure

- `server/handlers.ts`: create, vote and report route handler logic; `server/list-feedback.ts`: board query
- `lib/`: Zod input schema and error messages, rate-limit constants, report outcomes, sort and status labels (all pure, unit-tested)
- `components/`: `feedback-screen` (heading + form + Suspense), `feedback-form`, `feedback-board`, `feedback-item`, `vote-button`, `report-button`, `sort-tabs`
