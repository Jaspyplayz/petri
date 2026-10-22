# Feedback board

Feature id: `feedback` · Route: `/feedback` · API: `POST /api/feedback`, `POST /api/feedback/:id/vote`

## What it does

Anonymous visitors post an idea or a bug (1–280 characters plus a category) and upvote other items. Each item shows its vote count, category, status (`new → triaged → building → shipped | rejected`) and a link to its issue or PR once the agents pick it up. The list sorts by **Top** (votes, then newest) or **Newest** via `?sort=top|new`.

## Invariants

- **Reads** use the anon key, which can only select public columns of rows where `hidden = false` (RLS + column grants). Hashed IPs are never readable.
- **Writes** go only through the route handlers in `server/handlers.ts`, which use the service role on the server. The anon key cannot insert, update or delete anything.
- Input is validated with Zod (trimmed body 1–280 chars, `idea | bug`); unknown keys like `status` are dropped. Request bodies over 4 KB get 413 without being fully read. The DB repeats the length rule as a CHECK.
- **Rate limits** per IP: 5 posts and 30 votes per rolling hour, enforced atomically by the `consume_rate_limit` RPC. Over the limit returns 429 with `Retry-After`. The IP is stored only as `sha256(RATE_LIMIT_SALT + ":" + ip)`.
- The client IP comes from the first `x-forwarded-for` entry (Vercel overwrites this header, so it can't be spoofed in production). Locally it is client-controlled, which the e2e fixture uses to give each test its own rate-limit bucket.
- One vote per IP hash per item (`UNIQUE (feedback_id, voter_hash)`); a repeat vote is idempotent (200 `{ alreadyVoted: true }`, no count change) and the button shows as voted. Vote counts are maintained by a DB trigger.
- The board is fetched at request time inside `<Suspense>` (Cache Components); after a write the client calls `router.refresh()`.

## Structure

- `server/handlers.ts`: create + vote route handler logic; `server/rate-limit.ts`: IP hashing and the rate-limit RPC; `server/list-feedback.ts`: board query
- `lib/`: Zod input schema and error messages, rate-limit constants and IP parsing, sort and status labels (all pure, unit-tested)
- `components/`: `feedback-screen` (heading + form + Suspense), `feedback-form`, `feedback-board`, `feedback-item`, `vote-button`, `sort-tabs`
