---
description: Run one turn of the evolution loop (triage → build → verify) in GitHub Actions and report the result
argument-hint: "[issue number to build, or empty to triage first]"
---

Run one turn of Petri's evolution loop in GitHub Actions for `Jaspyplayz/petri`, watch it, and report. Everything runs in CI; you only dispatch and watch. Follow the `investigate-before-claiming` skill: report what the runs and PRs show, with links.

Arguments: $ARGUMENTS

1. **Check the gate first** and stop with the reason if any of these blocks it:
   - `gh variable get EVOLUTION_ENABLED --repo Jaspyplayz/petri` must be `true`.
   - `.evolution/PAUSED` must not exist on `main` (`gh api repos/Jaspyplayz/petri/contents/.evolution/PAUSED` returns 404).
   - Open evolution PRs (`gh pr list --label evolution --state open`) must be fewer than `maxOpenEvolutionPRs` in `.evolution/config.json`.
2. **If an issue number was given**, skip triage: `gh workflow run evolution-build.yml --repo Jaspyplayz/petri -f issue=<n>`.
3. **Otherwise**, if an open `evolution:ready` issue exists, the build is already due: dispatch `evolution-build.yml` with no input. If none exists, check there's feedback to triage (the `triage-feedback` skill's query). With none, stop and say so. Else dispatch `evolution-triage.yml`, wait for it, and list the issues it filed. Their `evolution:ready` label starts the build.
4. **Watch the build** (`gh run watch <id> --exit-status`). If it ends without a PR, report the `stuck` job's comment on the issue.
5. **Watch the PR's checks** until `evolution-verify` reports. Report:
   - the PR link, its size and the files it touches
   - the verifier's verdict and score per criterion, from its `evolution-verify` comment
   - the `evolution-automerge` comment: merged, or why not
6. **If it merged**, watch `evolution-post-merge.yml` and report the Timeline entry and the production verify result.

Never merge, approve or close a PR yourself. Never change `trustLevel`, `EVOLUTION_ENABLED` or `.evolution/PAUSED`. Those are the human's. If something fails, report the run link and the failing step's lines, and stop.
