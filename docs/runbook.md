# Runbook

How to run Petri's evolution loop day to day: stop it, start it, undo a change, move the trust level, read what the agents used, and run the evals.

Run the commands from an up-to-date checkout of `main`, after `pnpm install`, with `gh` logged in. Everything in the github.com column also works in a phone browser.

## Quick reference

| To | Command | Or on github.com |
|---|---|---|
| Stop the loop | `pnpm evolution:pause` | Set the variable `EVOLUTION_ENABLED` to `false` |
| Start it again | `pnpm evolution:resume` | Set `EVOLUTION_ENABLED` to `true` |
| Stop new feedback posts | `pnpm app:flags set feedback_open false --prod` | |
| Stop every visitor write | `pnpm app:flags set read_only_mode true --prod` | |
| Check production for a spike and act on it | `gh workflow run evolution-guardian.yml -f act=true` | **Actions → evolution-guardian → Run workflow**, tick `act` |
| Undo a merged PR | | The PR's **Revert** button, then merge the new PR |
| See the trust level and whether to promote | `pnpm trust-report` | |
| Change the trust level | A PR that edits `trustLevel` (see below) | Edit `.evolution/config.json` and propose the change |
| Read the last 7 days of agent usage | `gh workflow run evolution-weekly.yml` | **Actions → evolution-weekly → Run workflow** |
| Run the evals | `pnpm evals <skill>` | **Actions → evals → Run workflow** |

The variable is under **Settings → Secrets and variables → Actions → Variables**.

## See what state the loop is in

Three things decide whether an agent runs:

```sh
gh variable get EVOLUTION_ENABLED
gh api 'repos/{owner}/{repo}/contents/.evolution/PAUSED' -H "Accept: application/vnd.github.raw"
pnpm trust-report
```

- `EVOLUTION_ENABLED` has to be `true`. Every agent workflow's gate checks it first.
- The second command prints the pause file on `main`, or fails with a 404 when there is none. The loop is paused while the file's `until` is in the future or `null`.
- The first line of the trust report has the trust level.

The triage and build gates also close at the weekly budget and at the caps in `.evolution/config.json`. A closed gate ends the run green without starting an agent, and the run's summary has the reason.

## Stop the loop

```sh
pnpm evolution:pause
```

It sets `EVOLUTION_ENABLED` to `false` and cancels the queued and running runs of triage, build, verify and automerge. Post-merge and pr-closed finish, because they only record what already happened. The guardian keeps running, because it only lowers risk.

From a phone, set `EVOLUTION_ENABLED` to `false` on github.com. That closes every gate, but runs that already passed their gate keep going. Cancel those in the **Actions** tab.

## Start the loop again

```sh
pnpm evolution:resume
```

It sets `EVOLUTION_ENABLED` to `true`. It refuses while `.evolution/PAUSED` on `main` is active, so it can't undo the guardian's pause.

The guardian's pause ends by itself at its `until`, 24 hours after the incident. To end it sooner, delete `.evolution/PAUSED` in a PR of your own. An agent PR can add or extend a pause, but never remove one.

## Stop visitors' writes

The app reads two flags from its database at request time and caches them for 30 seconds per server instance.

```sh
pnpm app:flags --prod                              # print both flags
pnpm app:flags set feedback_open false --prod      # no new feedback posts
pnpm app:flags set read_only_mode true --prod      # no posts, votes, reports or analytics events
```

`--prod` takes the production URL and service-role key from `.env.setup`. Without it, the command acts on the local database. Set a flag back with the same command and the other value.

## Undo a change

### Let the guardian do it

The guardian compares the Sentry errors of the release that production serves with the previous release's. On a spike it does the following:

1. It rolls production back to the previous deployment with Vercel's Instant Rollback.
2. It opens two PRs with auto-merge on. One extends `.evolution/PAUSED` to 24 hours from now and lowers `trustLevel` by one. The other reverts the newest evolution change that went live.
3. It opens an issue, which notifies you.

When both PRs have merged, the next guardian run promotes the revert's deployment, which turns Vercel's automatic deploys back on. Post-merge adds a "Reverted" entry to the Timeline and starts the postmortem. The postmortem opens a `postmortem/` PR, which you review and merge.

Until the crons are on (Phase 9.1), nothing runs the guardian by itself. Dispatch it:

```sh
gh workflow run evolution-guardian.yml             # a dry run that reports what it would do
gh workflow run evolution-guardian.yml -f act=true
```

During an incident, you may need to do one of these:

- To keep production on the rollback, add the `needs-human` label to the incident issue. The guardian doesn't promote while the label is there.
- If the promote failed, every guardian run fails until production is fixed. Promote the revert's deployment yourself in Vercel (**Deployments**, then the deployment's menu, then **Promote**). Or remove the `guardian:promoted` label from the revert PR to let the guardian try once more.
- The guardian reverts only evolution changes. When the deployment that spiked has only human commits, it rolls back, tells you, and leaves the revert to you.

### Do it yourself

Open the merged PR on GitHub and click **Revert**. GitHub opens a PR that reverts it. Merge that PR once its checks pass. Its title starts with `Revert "`, so the trust report counts it as a revert.

If the change is breaking production now, roll back in Vercel first. In **Deployments**, open the menu of the deployment before the bad one and choose **Instant Rollback**. After a rollback, Vercel builds new production deployments but doesn't put them live. Once the revert's deployment is ready, promote it from its menu.

A revert you make by hand doesn't add a Timeline entry, pause the loop, lower the trust level or start a postmortem. Do the ones you want:

- Stop the loop with `pnpm evolution:pause`.
- Lower the trust level as described in the next section.
- Start a postmortem of an evolution PR with `gh workflow run evolution-postmortem.yml -f pr=<number> -f note="<what went wrong>"`. For any other mistake, run `/postmortem <PR or run link>` in Claude Code.

## Change the trust level

The level is `trustLevel` in `.evolution/config.json`. Only a PR of yours can raise it. The guardian and other agent PRs can only lower it.

`pnpm trust-report` prints the stats at the current level and suggests a promotion when the level's criteria in `CLAUDE.md` are met. The weekly workflow posts the same report as an `evolution:trust-report` issue. Neither changes the level.

To change the level on github.com, open `.evolution/config.json`, edit it, and change `trustLevel`. Choose **Create a new branch for this commit and start a pull request**, then merge the PR once its checks pass.

From a terminal:

```sh
git switch -c trust/level-1 origin/main
# change "trustLevel" in .evolution/config.json
git commit -am "chore(evolution): raise the trust level to 1"
git push -u origin trust/level-1
gh pr create --fill
gh pr merge --squash --auto
```

Lower the level the same way. The trust report counts from the commit that last changed the level, so every change starts a new count. Claude Code's hooks block edits to `.evolution/` unless you started Claude Code as a human session (`docs/MANUAL_STEPS.md`, "Editing guardrails with Claude").

## Read the agent usage

```sh
gh workflow run evolution-weekly.yml
```

It opens an `evolution:weekly` issue with each workflow's runs, failures, turns, agent minutes and API-equivalent dollars over the last 7 days, and the share of `weeklyBudget` they used. Then it posts the trust report.

`pnpm evolution:weekly` prints the same table from the database in `.env.local`, which `pnpm env:local` points at the local stack. To see production's rows one by one, open the `agent_runs` table in Supabase's Table Editor.

When either budget is used up, the triage and build gates close until older runs leave the 7-day window. To change the budget, edit `weeklyBudget` in `.evolution/config.json` in a PR of yours. `docs/costs.md` explains the numbers.

## Run the evals

```sh
pnpm evals:report         # the latest score of every case, from evals/results.jsonl
pnpm evals verify-app     # every case of one skill
pnpm evals                # every case (8 cases cost about $13 of API-equivalent usage)
```

`/run-evals <skill>` in Claude Code runs them and explains every score below 9. Commit or stash your changes first, because the runner copies the repo at `HEAD`. A local run needs Docker running.

Read a case's `task.md` and `setup.sh` before you run it. `setup.sh` runs in a container, but the agent under test then runs the case's code on your machine without a sandbox. This matters most for a case that a postmortem PR added.

To run them in CI:

```sh
gh workflow run evals.yml -f skills="verify-app" -f max=1
```

An empty `skills` runs every skill, and `max` is the number of cases per skill. A PR of yours that changes `.claude/skills/**` runs the evals of the skills it changes. Agent PRs never run them, because the job gives the PR's code a Claude token. To run the first case of every skill each night, run `gh variable set EVALS_NIGHTLY --body true`. CI runs report in the job summary and an artifact. Only local runs add lines to `evals/results.jsonl`.
