# Porting the setup to another Next.js app

This guide moves Petri's tooling to an existing Next.js app, such as the League of Legends app. Four pieces move, in this order:

1. The guardrails, so a bad change turns the build red.
2. The verify CLI and the feature map, so an agent can find a feature and prove a change in a real browser.
3. `CLAUDE.md` and the trust ladder at level 0, so an agent knows the rules and a human merges everything.
4. The evolution loop.

Each piece needs the ones before it. The loop's build agent runs `pnpm check` and `pnpm verify:*`. Automerge reads each manifest's `riskLevel` and the trust level. An agent that can't be stopped by CI or checked in a browser must not open PRs. Finish each piece's check before you start the next one.

The paths below are Petri's. Copy a file to the same path in the other app unless a step says otherwise.

## Before you start

The tooling assumes the following about the app:

- **Node 24 and pnpm.** Several scripts run `.ts` files directly with `node` (for example `pnpm boundaries` and the Claude Code hooks), and `.github/actions/setup/action.yml` installs both. If the app uses npm or yarn, switching to pnpm is less work than rewriting every `pnpm` call in the workflows, hooks and skills.
- **Next.js App Router and TypeScript.** `pnpm lint` and `pnpm typecheck` start with `next typegen`.
- **A `src/app`, `src/features`, `src/shared` layout.** The boundaries, feature and feature-map checks read it. Step 2 creates it.
- **Docker and Supabase for verify and the loop.** `pnpm verify:up` starts local Supabase when it starts the app. The loop keeps feedback, the Timeline and its run records in Supabase.
- **Vercel and Sentry for post-merge and the guardian.** Post-merge waits for Vercel's commit status. The guardian reads Sentry and rolls back through the Vercel API.

Work in a Claude Code session started as a human (`docs/MANUAL_STEPS.md`, "Editing guardrails with Claude"). Once the hooks are copied, they block writes to protected paths in any other session.

## 1. Guardrails

1. Copy the parts that don't depend on the app:
   - `scripts/check-pr/`, `scripts/check-protected-paths.ts`, `scripts/check-pr-size.ts`, `scripts/check-agent-pr.ts`, `scripts/check.ts`, `scripts/check/`
   - `.github/workflows/guardrails.yml`, `.github/guardrails.json`, `.github/actions/setup/`
   - `.claude/hooks/`, `.claude/settings.json`, `lefthook.yml`
2. Edit `.github/guardrails.json`. In `protectedPaths`, replace Petri's own sensitive files (`src/shared/env.ts`, `src/shared/lib/log.ts`, `src/shared/lib/sentry-options.ts`, `src/instrumentation*.ts`, `supabase/*`, `vercel.json`) with the app's. In `prSize.ignoredPaths`, list the app's generated files.
3. Copy the compiler flags from `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `noFallthroughCasesInSwitch`.
4. Copy `eslint.config.mjs` and `lint-rules/`. Its custom bans each assume a file the app must have:
   - no comments in `src/`
   - `useEffect` only in `src/shared/ui/effects/`
   - `process.env` only in `src/shared/env.ts`
   - `console` only through `src/shared/lib/log.ts`
   - e2e tests only through `src/shared/testing/e2e-fixture.ts`
   - `import "server-only"` first in every `server/` file
   An existing app breaks most of these in many files. Turn a ban on only after you fix the code it flags. `lint-rules/lint-config.test.ts` fails when a block loosens a rule for some files, so an ignore list doesn't get past it. Update that test's reference files to the app's.
5. Copy `.github/workflows/ci.yml`. Leave out the `boundaries`, `features`, `featuremap` and `e2e` jobs, and remove `boundaries`, `features` and `featuremap` from `scripts/check/gates.ts`. They need step 2. `scripts/check/gates.test.ts` compares the gates with `ci.yml`, so change both together.
6. Protect `main` with `gh api`: require `ci-ok` and `guardrails-ok`, allow squash merges only, block force pushes, and require 0 approvals. Turn on auto-merge with `gh repo edit --enable-auto-merge`.

**Check.** Open a throwaway PR for each rule (`any`, a comment, a `useEffect`, a protected-path edit from a branch named `evo/test`, a fake secret) and see its CI job fail. Close them afterwards. Petri's Phase 2 evidence in `PROGRESS.md` shows the full list.

## 2. Verification and the feature map

The checks need every feature in `src/features/<id>/`, with a `feature.manifest.ts`, `index.ts`, `README.md`, a unit test and an e2e test. Every `data-testid` inside the folder has to be a selector in its manifest, and every selector has to appear in the folder. An existing app has none of this, so a subagent plans the split first.

1. Copy the generic parts:
   - `scripts/verify.ts`, `scripts/verify/`, `scripts/featuremap.ts`, `scripts/featuremap/`, `scripts/check-featuremap.ts`, `scripts/check-featuremap/`, `scripts/check-features.ts`, `scripts/check-features/`, `scripts/check-boundaries.ts`, `scripts/check-boundaries/`, `scripts/new-feature.ts`, `scripts/new-feature/`, `.dependency-cruiser.cjs`
   - `src/shared/lib/feature-manifest.ts`, `src/shared/testing/`
   - `.claude/skills/verify-app/`, `.claude/skills/maintain-feature-map/`, `.claude/skills/new-feature/`
2. Create `src/features/registry.ts` with an empty `featureManifests` list.
3. Adapt what is Petri's:
   - `scripts/new-feature/templates.ts` writes Tailwind classes and a `src/app/<route>/page.tsx`. Match the app's styling.
   - `scripts/check-features/manifests.test.ts` names Petri's four features.
   - The examples in the `verify-app` and `maintain-feature-map` skills use the blob's selectors and `feedback.post`.
   - `scripts/verify/server.ts` starts local Supabase and writes `.env.local`. If the app needs other services or env names, start them there.
4. Ask a subagent for the plan. Paste this into Claude Code in the app's repo:

   ```text
   Explore this Next.js app read-only and propose how to split it into feature folders for the feature-map tooling
   in scripts/ (read src/shared/lib/feature-manifest.ts for the manifest type, and scripts/check-features/ and
   scripts/check-featuremap/ for what the checks require). A feature is one thing a visitor can see and use, such as
   a page or a panel. For each feature give: an id (kebab-case), the files that would move into src/features/<id>/,
   the routes, where it is on screen (uiLocation), the steps to reach it from / (howToReach), the data-testids it
   needs with the element each goes on, two or three flows written in the step language of scripts/verify/, the data
   it reads (dataTables) and a riskLevel (low for copy and styling, high for anything that writes data or handles
   accounts). List the imports between the proposed features: the boundaries check forbids them, so say what moves
   to src/shared/. Cite path:line for every claim. Don't edit anything.
   ```

5. Move one feature at a time. Run `pnpm new:feature <id>`, move the feature's files in, add the `data-testid`s, fill in the manifest, and run `pnpm featuremap`. Then run `pnpm check` and `pnpm verify:flow <id>.<flow>`, and commit before you start the next feature.
6. Put the `boundaries`, `features`, `featuremap` and `e2e` jobs back in `ci.yml`, and the gates back in `scripts/check/gates.ts`.

**Check.** `pnpm verify:all` passes, and you have read its screenshots. A `console.error` added to a component fails it. Renaming one `data-testid` without its manifest fails `pnpm featuremap:check`.

## 3. CLAUDE.md and the trust ladder at level 0

1. Write the app's `CLAUDE.md` from Petri's. Keep the workflow, conventions, pull requests, hallucination and trust ladder sections. Replace the app description, the blob examples and the Supabase migration rule if the app has no migrations. Keep it under 150 lines.
2. Copy `.github/pull_request_template.md` and replace its `fix(blob)` example.
3. Copy `.evolution/config.json` with `"trustLevel": 0`. Set `productionUrl` and the `sentry` thresholds, which `scripts/evolution/config.ts` requires.
4. Copy `scripts/trust-report.ts` and `scripts/trust-report/`. The ladder's thresholds are in `scripts/trust-report/ladder.ts`.

**Check.** `pnpm trust-report` prints level 0. A PR from a branch named `evo/test` that edits `.evolution/config.json` fails `protected-paths`.

## 4. The evolution loop

The loop needs somewhere for visitors' feedback and for the Timeline. Triage reads `feedback` and `events`. Create-issues, pr-closed and post-merge write `feedback`. Post-merge writes `changelog`. The gate, the weekly report and the guardian use `agent_runs`. The build uploads screenshots to the `verification-screenshots` bucket. The least work is to copy Petri's `feedback`, `timeline` and `analytics` features, the `src/shared/` code they import, and the migrations that create their tables. If the app keeps its data somewhere else, give these tables a Supabase project of their own.

1. Create the Supabase project and apply the migrations in `supabase/migrations/`. Copy `supabase/config.toml` and change its `project_id`.
2. Copy the loop:
   - `.github/workflows/evolution-*.yml`, `evals.yml`, `claude-code-review.yml`, `claude.yml`, `.github/actions/app-stack/`
   - `scripts/evolution-*.ts`, `scripts/evolution/`, `scripts/agent-tools/`, `scripts/app-flags.ts`, `scripts/setup-secrets.ts`, `scripts/setup-secrets/`, `scripts/setup-labels.ts`, `scripts/setup-labels/`, `scripts/evals.ts`, `scripts/evals-report.ts`, `scripts/evals/`
   - `.evolution/prompts/`, `.claude/skills/` (the rest), `.claude/agents/`, `.claude/commands/`
3. Replace the Petri names. `git grep -n -i -e petri -e blob -e Jaspyplayz` lists them: the prompts, the skills, `/evolve-once`, the `code-searcher` agent, the `petri-evolution` commit identity in `evolution-build.yml` and the help text in `scripts/setup-secrets/plan.ts`.
4. Write new eval cases. Petri's cases edit `src/features/blob/`, so they don't apply. Keep the runner, and write two cases for each core skill against the app's features.
5. Do the account steps in `docs/MANUAL_STEPS.md`: the Claude GitHub App, `EVOLUTION_BOT_TOKEN`, then `pnpm setup:secrets --apply` and `pnpm setup:labels --apply`. Add `evolution-verify` to the required checks.
6. Run the loop by hand at level 0, with `EVOLUTION_ENABLED` set to `true` and every workflow on `workflow_dispatch`. Bring the workflows up in this order: triage, build, verify and automerge, post-merge, the guardian as a dry run, then the guardian with `act`. Seed feedback the way Petri's Phase 6 dry run did, with a vague item, a prompt-injection attempt and an oversized request.
7. Turn on the crons and move to level 1 only after the dry run passes. `docs/runbook.md` covers running the loop from then on.

**Check.** One feedback item reaches the Timeline through a PR that a human merged. A deliberately broken change on production makes the guardian roll back, revert and pause, as in Petri's Phase 8 exit test.

## What stays in Petri

The blob, the Petri copy and Petri's eval cases stay. So does anything in `docs/decisions.md` and `docs/agent-mistakes.md`, although both are worth reading before you port: most guards exist because an agent got past an earlier version.
