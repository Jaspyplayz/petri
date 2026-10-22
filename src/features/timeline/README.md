# Timeline

Feature id: `timeline` · Route: `/timeline`

## What it does

Describe the user-facing behaviour in a few sentences.

## Invariants

- List the rules that must stay true (limits, privacy, data ownership).

## Structure

- `feature.manifest.ts`: id, routes, selectors and verification flows (source of FEATURE_MAP.md)
- `index.ts`: the only public entry point; `src/app` imports from here
- `components/`: UI, `server/`: server-only code (`import "server-only"`), `lib/`: pure logic
- `tests/`: `*.test.ts` (Vitest) and `*.e2e.ts` (Playwright)
