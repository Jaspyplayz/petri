<!-- Title: a conventional commit, e.g. "fix(blob): keep the name after a reload". One issue and one concern per PR. -->

## Why

<!-- The issue and the feedback ids this answers, e.g. "Closes #12. Feedback: 3f2c…, 9a1b…". For a change nobody asked for, say what's wrong today. -->

## What changed

<!-- What a user or a developer will notice, in a few lines. Cite the files that matter. -->

## Feature(s) touched

<!-- The feature ids from FEATURE_MAP.md, e.g. `blob`. Say so if `src/shared/` or more than one feature changed. -->

## Verification report + screenshots

<!-- Paste the pnpm verify summary (`artifacts/verify/<run>/summary.md`) and the screenshots, or `compare.md` and the side-by-sides from pnpm verify:compare for a UI change. Say which flows you ran and that `pnpm check` passed. -->

## Risk

<!-- The feature's riskLevel and what could break. Say whether it adds a dependency, touches data or changes a protected path. -->

## Rollback

<!-- How to undo it: usually "revert this PR". Say if a revert isn't enough (data written, a migration, a config change). -->
