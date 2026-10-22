# Blob

Feature id: `blob` · Route: `/`

## What it does

The home page shows the Blob, a squishy SVG creature. Visitors can:

- **Poke** it (click the creature or the Poke button): it wobbles and squints, and the poke counter goes up.
- **Feed** it: it grows by 5% per snack, up to 200%. At full size the Feed button says "Too full".
- **Name** it: 1–24 characters after trimming. Invalid names show an inline error.

## Invariants

- State lives only in `localStorage` under `petri.blob.v1`. There is no backend, so changes here are low-risk.
- Stored state is validated with Zod on read. Corrupt or out-of-range data falls back to the initial state; it never crashes the page.
- The server render uses the initial state; the browser swaps in stored state via `useSyncExternalStore` (no `useEffect`).
- Every interaction sends an analytics event (`blob` + `poke` / `feed` / `rename`) through `shared/lib/track`.
- Animations respect `prefers-reduced-motion`.

## Structure

- `lib/blob-state.ts`: pure state transitions (`poke`, `feed`, `rename`), parsing and formatting
- `components/blob-creature.tsx`: the client component (SVG, buttons, rename form)
- `tests/`: unit tests for the state logic, e2e tests for poke / feed / rename
