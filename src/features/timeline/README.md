# Timeline

Feature id: `timeline` · Route: `/timeline`

## What it does

The public changelog. Newest first, each entry shows its title, a plain-English summary, the feedback items behind it, the PR link, the short commit SHA, the trust level at merge time, before/after screenshots and the merge time. Reverts appear too, with a red "Reverted" badge. A counter at the top reads "N changes shipped, 0 written by humans".

## Invariants

- Read-only for the public: the page reads `changelog` and `feedback` with the anon key. Only CI writes `changelog`, using the service role.
- Data is fetched at request time inside a `<Suspense>` boundary (Cache Components), so new entries appear without a redeploy.
- Times are formatted in UTC so server output is deterministic.
- The counter is exact (DB `count`, not limited to the 100 rows shown): `change` entries minus `revert` entries, so a reverted change no longer counts as shipped.

## Structure

- `server/list-timeline.ts`: loads changelog rows plus their linked feedback (server-only)
- `lib/timeline-format.ts`: pure formatting (counter text, short SHA, dates)
- `components/`: `timeline-screen` (heading + Suspense), `timeline-feed` (async data), `timeline-entry` (card)
