# Feedback board

Feature id: `feedback` · Route: `/feedback`

## What it does

Anonymous visitors see every visible idea and bug report, each with its vote count, category, status (`new → triaged → building → shipped | rejected`) and a link to its issue or PR once the agents pick it up. The list sorts by **Top** (votes, then newest) or **Newest** via `?sort=top|new`.

## Invariants

- Reads use the anon key, which can only select public columns of rows where `hidden = false` (RLS + column grants). Hashed IPs are never readable.
- The board is fetched at request time inside `<Suspense>` (Cache Components), so it is always fresh.
- At most 100 items are shown.

## Structure

- `server/list-feedback.ts`: board query (server-only)
- `lib/feedback-sort.ts`, `lib/feedback-status.ts`: pure parsing and labels
- `components/`: `feedback-screen` (heading + Suspense), `feedback-board` (async data + sort tabs), `feedback-item`, `vote-count`, `sort-tabs`
