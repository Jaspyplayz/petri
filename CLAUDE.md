# CLAUDE.md

**Source of truth:** [`STARTER_PROMPT.md`](./STARTER_PROMPT.md). Read it before doing anything, and defer to it when in doubt.

## Rules

- Follow the phases in `STARTER_PROMPT.md` in order. Finish and verify each phase before starting the next.
- Keep PRs small and focused — one logical change per PR.
- Never weaken CI, tests, or guardrails (no skipping/disabling checks, loosening thresholds, or bypassing branch protection) to get a change merged.
- Read [`FEATURE_MAP.md`](./FEATURE_MAP.md) before any task. Use it to map vague feedback ("the thing on the right is broken ???", or a screenshot) to a feature folder and a flow, then reproduce with that flow (`verify-app` skill).
- When UI changes, update the feature's manifest in the same change and regenerate the map with `pnpm featuremap` (`maintain-feature-map` skill). Never edit `FEATURE_MAP.md` by hand.
