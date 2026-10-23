# CLAUDE.md

Petri is a small public Next.js app that changes itself. Visitors leave feedback. Agents turn it into small issues, build each one on a branch, verify it in a real browser, and auto-merge it when every gate passes and the trust level allows it. The public Timeline shows each change and why it happened.

- **Source of truth:** [`STARTER_PROMPT.md`](./STARTER_PROMPT.md). Defer to it when in doubt. While the project is being bootstrapped, follow its phases in order, and finish and verify each phase before starting the next.
- [`FEATURE_MAP.md`](./FEATURE_MAP.md): what's on screen → feature folder, `data-testid` selectors, flows. Read it before any task.
- [`docs/architecture.md`](./docs/architecture.md): folder layout, data model, workflows, the evolution loop.
- [`docs/decisions.md`](./docs/decisions.md): one line per decision. [`docs/agent-mistakes.md`](./docs/agent-mistakes.md): log every agent mistake you catch.
- Skills (`.claude/skills/`): `verify-app` (build, drive and screenshot the real app), `maintain-feature-map` (keep manifests and the map true).

Detail lives in the skills and docs. This file is the short version.

## Workflow

1. **Map it.** Read `FEATURE_MAP.md` and map the issue or feedback ("the thing on the right is broken ???", a screenshot) to a feature folder and a flow.
2. **Reproduce it** with `verify-app`: `pnpm verify:flow <feature>.<flow>`, or `pnpm verify:script` for a path no flow covers yet.
3. **Make the smallest change** that does it. When UI changes, update the feature's manifest in the same change and run `pnpm featuremap` (`maintain-feature-map`). Never edit `FEATURE_MAP.md` by hand.
4. **`pnpm check`** runs every local gate (typecheck, lint, boundaries, features, featuremap, unit tests with coverage). Fix everything it reports.
5. **Verify** with `pnpm verify:all`, or `pnpm verify:compare origin/main <feature>.<flow>` for a UI change. Read every screenshot and the console errors. Never write "should work".
6. **Open the PR** from `.github/pull_request_template.md`.

## Conventions

- New feature: always `pnpm new:feature <id>`. Never make a feature folder by hand.
- Stay inside one feature folder when you can. A feature's public entry is its `index.ts`. Features never import each other (CI's `boundaries` check). `src/shared/` is for code that two or more features need.
- Server first: Server Components and `server/` modules by default. Add `"use client"` only for interactivity or browser APIs.
- No new dependency without a line in `docs/decisions.md`. `package.json` and the lockfile are protected, and new dependencies are blocked below trust level 3.
- Never lower a manifest's `riskLevel`. The trust ladder decides what may auto-merge from it.
- Never weaken CI, tests or guardrails (no skipping or disabling checks, loosening thresholds, or bypassing branch protection) to get a change merged. A protected path (`.github/guardrails.json`) in an agent PR fails CI. That is the design: the change needs a human.

## Pull requests

- **Small and atomic:** one issue per PR and one concern per PR, easy to revert. Squash-merge with a conventional title such as `fix(blob): keep the name after a reload`.
- The body follows `.github/pull_request_template.md`: *Why (feedback ids) / What changed / Feature(s) touched / Verification report + screenshots / Risk / Rollback.*
- Agent PRs use the branch `evo/<issue#>-<slug>` and the `evolution` label. CI caps them at 400 changed lines (the lockfile and generated files don't count).

## Guard against hallucination

- Before you name a root cause, cite the files and lines you actually read (`path:line`).
- Use subagents to search the code instead of guessing where something lives.
- Prove it, don't guess. "I found it" needs a reproduction: a verify flow or a test that fails before the fix and passes after it.
- If you can't reproduce it, say so in the PR or issue rather than shipping a guess.

## The trust ladder

The current level is `trustLevel` in [`.evolution/config.json`](./.evolution/config.json). The file is protected, so only a human raises it.

| Level | Agents may auto-merge | Promotion criteria |
|---|---|---|
| 0 | Nothing. Agents open PRs; a human merges. | The loop runs end-to-end 3 times |
| 1 | `riskLevel: low` changes inside ONE existing feature folder (copy, styling, blob behaviours) | 10 auto-merged PRs, 0 reverts |
| 2 | New features created with the generator; changes inside any single feature | 20 more PRs, ≤1 revert, Sentry clean |
| 3 | Changes touching `src/shared/`, several features, or adding dependencies from an allow-list | 30 more PRs, ≤1 revert |
| 4 | Supabase migrations (additive only, CI-checked) | A human decision |

- The level is 0 until the Phase 6 dry run passes; then a human sets it to 1.
- `pnpm trust-report` (`scripts/trust-report.ts`, run weekly once the loop is live) computes the stats and **suggests** a promotion in an issue. It never promotes.
- **Any automatic revert drops the level by one.** CI opens a PR that lowers `trustLevel`, which may auto-merge because it only lowers trust, and pauses the loop for 24 hours (`.evolution/PAUSED`).
- Never raise the level or remove `.evolution/PAUSED` yourself. Only the guardian lowers it, and only a human raises it.
