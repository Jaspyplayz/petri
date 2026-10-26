# Blob

Feature id: `blob` · Route: `/`

## What it does

The home page shows the Blob, a squishy SVG creature. Visitors can:

- **Poke** it (click the creature or the Poke button): it wobbles and squints, then settles back to calm breathing; the poke counter goes up.
- **Feed** it: it gulps (open mouth, short wobble) and grows by 5% per snack, up to 200%. At full size the Feed button says "Too full".
- **Colour** it: pick a swatch (green, pink, blue, orange, purple); the choice is stored with the rest of the state.
- **See its mood**: from 22:00 to 06:00 in the visitor's local time Blobby is Sleepy (eyes stay shut, no blinking); otherwise it is Awake. In the daytime a snack makes it Happy, with a big grin, for 4 seconds before it fades back to Awake; at night it stays Sleepy. Poke and feed work in both moods. `?hour=0`–`?hour=23` pins the hour so verify flows don't depend on the real clock; the server render shows Awake until the browser reads its clock.
- **Surprise** it: when the Evolved count under the face is higher than the count this browser last saw, the mood reads Surprised and the face shows raised brows and an open mouth until the next visit (a daytime snack still makes it Happy). The new count is remembered in `localStorage` under `petri.blob.seen.v1`; a first visit just remembers it. `?seen=N` pins the last-seen count for verify flows.
- **Name** it: 1–24 characters after trimming. Invalid names show an inline error.

## Invariants

- State lives only in `localStorage` under `petri.blob.v1` (plus the last-seen Evolved count under `petri.blob.seen.v1`). There is no backend, so changes here are low-risk.
- Stored state is validated with Zod on read. Corrupt or out-of-range data falls back to the initial state; it never crashes the page.
- The server render uses the initial state; the browser swaps in stored state via `useSyncExternalStore` (no `useEffect`).
- Every interaction sends an analytics event (`blob` + `poke` / `feed` / `rename`) through `shared/lib/track`.
- Animations respect `prefers-reduced-motion` (the wobble shrinks to 1 ms so the mood still resets on `animationend`).

## Structure

- `lib/blob-state.ts`: pure state transitions (`poke`, `feed`, `rename`), parsing and formatting
- `components/blob-creature.tsx`: the client component (SVG, buttons, rename form)
- `tests/`: unit tests for the state logic, e2e tests for poke / feed / rename
