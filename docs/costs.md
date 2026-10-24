# Costs

Petri is meant to cost nothing to run beyond the maintainer's Claude Max plan. This page lists what each service is used for, how it stays on the free tier, and how the loop's Claude usage is capped and reported.

Plans and quotas change. Check the linked pricing pages before relying on a number. This page names the knobs, not today's prices.

## The services

| Service | Plan | What Petri uses | How it stays free | If the limit is hit |
|---|---|---|---|---|
| [Vercel](https://vercel.com/pricing) | Hobby | The Next.js app, its route handlers, preview deployments for PRs | Hobby has no overage billing. Petri is a non-commercial demo, which Hobby requires. Analytics go to Supabase, not Vercel's paid add-ons. | Vercel pauses the project's usage until the next cycle. The app is down, not billed. Hobby also caps deployments per day: past it, the Vercel check fails with "Deployment rate limited — retry in 24 hours", so PRs get no preview and merges don't deploy until it resets (seen on #79). That check isn't required, and a busy day of PRs can reach it. |
| [Supabase](https://supabase.com/pricing) | Free | Postgres (feedback, votes, Timeline, `agent_runs`, flags, rate limits) and Storage (verify screenshots) | The Free plan has no billing, so its limits are hard limits. If the project ever moves to Pro, turn the **Spend Cap** on (Billing → Spend Cap), so overages are refused rather than charged. | Writes or uploads fail. A Free project also pauses after a week with no traffic; restore it from the dashboard. |
| [Sentry](https://sentry.io/pricing/) | Developer | Errors and performance events from the app; the guardian's spike check (8.5) reads them | Keep the free plan's quota. Under Settings → Spike Protection keep spike protection on, and use a rate limit on the DSN's client key so a loop of errors can't use the month's quota. | Events are dropped for the rest of the month, so the guardian can't see a spike. The weekly report is the place to notice. |
| GitHub Actions | Free (public repo) | CI, the evolution workflows, evals on demand | Standard hosted runners are free for public repositories. Every job has `timeout-minutes` (`workflow-limits.ts`), and artifacts are kept 30 days. | n/a for a public repo. Private forks pay for minutes. |
| Claude | Max plan (`CLAUDE_CODE_OAUTH_TOKEN`) | The triage, build, planner and judge agents; the PR review on human PRs; `@claude` | The plan has a fixed price. Its usage limits are the real cap, and the loop shares them with the maintainer's own Claude use. The caps below keep the loop to a known share. | Agent runs fail with a usage-limit error until the window resets. The gate doesn't retry them. |

## Claude usage

### The caps on every run

These come from earlier phases and are enforced in code:

- `.evolution/config.json`:
  - `maxIssuesPerTriage` (3)
  - `maxOpenEvolutionPRs` (1, so builds run one at a time)
  - `maxMergesPerDay` (6)
  - `maxAgentTurns` per agent (triage 15, build 80, verify 40)
- `timeout-minutes` on every job, and `--max-turns` on every claude-code-action step (`scripts/agent-tools/workflow-limits.ts`)
- The kill switch: `pnpm evolution:pause` turns the loop off and cancels its runs (8.1)

### What gets recorded

Every agent run is a row in `agent_runs`:

- the workflow and step: `triage`, `builder`, `planner`, `judge`
- the model and status: `pass`, `fail`, or `error` when no usage came back
- the turns, the agent's runtime and its API-equivalent cost

The figures come from the final `result` message in claude-code-action's execution log. A `jq` step reads that log, and a separate job, running main's code and never the agent's, writes the row. The builder's numbers are a report rather than proof, because the builder's job could have changed its runner. The schema rejects values that make no sense, and the turn and time limits above cap a run whatever it reports.

**API-equivalent $** is what the same tokens would cost on the API. On the Max plan it isn't charged. It's the best single measure of how much of the plan's limits the loop takes. For scale, one full eval run (`pnpm evals`, 8 cases) came to about $13.

Evals run locally or on demand (`evals.yml`, nightly only while `EVALS_NIGHTLY` is `true`) and aren't in `agent_runs`. Their cost is in `evals/results.jsonl`.

### The weekly budget

`weeklyBudget` in `.evolution/config.json` (a protected file, so only a human changes it) sets two limits:

- `turns` (3000)
- `agentMinutes` (900)

Both are rolling totals over the last 7 days for the triage, build, verify and postmortem agents.

- **The gate enforces it.** Before triage or build starts an agent, its gate reads the last 7 days of `agent_runs`. At or over either limit, the gate closes with the reason, and the run ends green without starting an agent. The loop picks up again once older runs leave the window, or when a human raises the budget. If `agent_runs` can't be read, the gate step fails rather than run without a budget.
- **Verify isn't gated by the budget.** It only reviews PRs that a build already opened, and every PR needs its `evolution-verify` status.
- **Neither is the postmortem.** It runs only after a guardian revert merges (or a maintainer dispatches it), on the build model and turn limit, and its turns still count toward the budget.
- **The starting numbers are a guess.** About 15 full build cycles at their turn limits (80 for the builder plus 40 each for the planner and the judge) and four triages a day fit under 3,000 turns. 900 minutes is 15 hours of agent time. Tune both after a few weekly reports.

### The weekly report

`evolution-weekly.yml` runs `pnpm evolution:weekly --issue`, which opens an `evolution:weekly` issue with:

- runs, failures, turns, agent minutes and API-equivalent $ per workflow
- the budgeted total, and the share of each budget used

It then runs `pnpm trust-report --issue`. It runs on demand for now; its weekly cron is turned on with the other crons in Phase 9.1. Run `pnpm evolution:weekly` locally (with `.env.local`) to print the same table without opening an issue.

## Checklist for the maintainer

- [ ] Vercel: the project is on Hobby and has no paid add-ons.
- [ ] Supabase: the project is on Free. If it's ever on Pro, the Spend Cap is on.
- [ ] Sentry: Developer plan, spike protection on, a rate limit on the DSN's key.
- [ ] Claude: the loop's token is the Max plan's (`claude setup-token`), not an API key with billing.
- [ ] Read the weekly report, and change `weeklyBudget` if the loop is crowding out your own Claude use.
