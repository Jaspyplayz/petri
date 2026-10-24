---
description: Run the evals for one or more skills (or all) and explain the scores
argument-hint: "[skill ...] [--max N] [--hill-climb]"
---

Run the skill evals for: $ARGUMENTS

If no skill is named, run every case. Each case takes a few minutes and spends Claude usage, so say how many cases will run before you start.

1. Commit or stash first: `pnpm evals` copies the repo at `HEAD`, so uncommitted skill changes aren't measured.
2. If the arguments include `--hill-climb`, hand the named skill to the `skill-evaluator` subagent and ask it to hill-climb. Otherwise run `pnpm evals <skills> [--max N]` yourself.
3. Run `pnpm evals:report` and show its table.
4. For every case below 9, read `judge.json` and `transcript.md` in `artifacts/evals/<run id>/<skill>__<case>/` and say in one sentence where the agent went wrong.

`evals/results.jsonl` gets one line per case. Commit it with the change it measured. Report the table, the failing cases and the run folder.
