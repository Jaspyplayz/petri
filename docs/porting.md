# Porting the setup to another Next.js app

This guide moves Petri's tooling to an existing Next.js app, such as the League of Legends app. Four pieces move, in this order:

1. The guardrails, so a bad change turns the build red.
2. The verify CLI and the feature map, so an agent can find a feature and prove a change in a real browser.
3. `CLAUDE.md` and the trust ladder at level 0, so an agent knows the rules and a human merges everything.
4. The evolution loop.

Each piece needs the ones before it. The loop's build agent runs `pnpm check` and `pnpm verify:*`. Automerge reads each manifest's `riskLevel` and the trust level. An agent that can't be stopped by CI or checked in a browser must not open PRs. Finish each piece's check before you start the next one.

The paths below are Petri's. Copy a file to the same path in the other app unless a step says otherwise. A script such as `check` is an entry in Petri's `package.json`.

## Before you start

The tooling assumes the following about the app:

- **Node 24 and pnpm.** Several scripts run `.ts` files directly with `node` (for example `pnpm boundaries` and the Claude Code hooks). `.github/actions/setup/action.yml` installs both and takes the pnpm version from `packageManager` in `package.json`. If the app uses npm or yarn, switching to pnpm is less work than rewriting every `pnpm` call in the workflows, hooks and skills.
- **Next.js App Router and TypeScript.** `pnpm lint` and `pnpm typecheck` start with `next typegen`.
- **A `src/app`, `src/features`, `src/shared` layout.** The boundaries, feature and feature-map checks read it. Step 2 creates it.
- **`main` as the default branch.** Post-merge, the build's PRs and the guardian's PRs name `main` in code.
- **Docker and Supabase for verify and the loop.** `pnpm verify:up` starts local Supabase when it starts the app. The loop keeps feedback, the Timeline and its run records in Supabase.
- **Vercel and Sentry for post-merge and the guardian.** Post-merge waits for the `Vercel` commit status from `vercel[bot]`, so connect the repo through Vercel's GitHub app. The guardian reads Sentry and rolls back through the Vercel API.
- **gitleaks on your PATH.** `lefthook.yml` runs it on every commit.

Work in a Claude Code session started as a human (`docs/MANUAL_STEPS.md`, "Editing guardrails with Claude"). Once the hooks are copied, they block writes to protected paths, `package.json` among them, in any other session.

## 1. Guardrails

1. Copy the parts that don't depend on the app:
   - `scripts/check-pr/`, `scripts/check-protected-paths.ts`, `scripts/check-pr-size.ts`, `scripts/check-agent-pr.ts`, `scripts/check.ts`, `scripts/check/`
   - `.github/workflows/guardrails.yml`, `.github/guardrails.json`, `.github/actions/setup/`
   - `.claude/hooks/`, `.claude/settings.json`, `lefthook.yml`
   - `vitest.config.ts` and `scripts/test/server-only-stub.ts`, for the tests' `@` alias and `server-only` stub
2. Edit `package.json` and `pnpm-workspace.yaml`:
   - Set `"type": "module"`, because the `tsx` scripts use top-level await. Rename any CommonJS `*.js` config to `.cjs` first.
   - Set `packageManager` to your pnpm version.
   - Copy `allowBuilds` from `pnpm-workspace.yaml`. Without it pnpm refuses to install esbuild, lefthook and supabase.
   - Copy the scripts `check`, `typecheck`, `lint`, `test`, `test:coverage`, `protected-paths` and `pr-size`.
   - Add the devDependencies `tsx`, `vitest`, `@vitest/coverage-v8`, `typescript-eslint`, `eslint-plugin-jsx-a11y` and `lefthook`.
3. Edit `protectedPaths` in `.github/guardrails.json`:
   - Keep `src/shared/env.ts`, `src/shared/lib/log.ts`, `src/shared/testing/**` and `src/shared/ui/effects/**`. `eslint.config.mjs` names them in its bans.
   - Keep `supabase/migrations/**`, `supabase/config.toml` and `supabase/seed.sql` if you'll do step 4. The migration rule in `scripts/check-pr/protected-paths.ts` only runs on a protected path, so without them agents could edit migrations at any trust level.
   - Drop `src/shared/server-env-schema.ts`, `src/shared/lib/sentry-options.ts`, `src/instrumentation*.ts` and `vercel.json` only for a file the app won't have.
   - Add the app's own sensitive files.

   In `prSize.ignoredPaths`, list the app's generated files.
4. Edit `tsconfig.json`:
   - Copy the compiler flags `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` and `noImplicitReturns`.
   - Copy `allowImportingTsExtensions`, because the scripts and hooks import `./x.ts`. Copy `erasableSyntaxOnly` and `verbatimModuleSyntax`, which keep the `.ts` files that `node` runs type-strippable.
   - Add `".claude/hooks/**/*.ts"` to `include`. TypeScript's `**` skips dot folders, and the typed lint rules fail on a file outside the project.
5. Copy `eslint.config.mjs` and `lint-rules/`. Its custom bans each assume a file the app must have:
   - no comments in `src/`
   - `useEffect` only in `src/shared/ui/effects/`
   - `process.env` only in `src/shared/env.ts`
   - `console` only through `src/shared/lib/log.ts`
   - e2e tests only through `src/shared/testing/e2e-fixture.ts`
   - `import "server-only"` first in every `server/` file
   An existing app breaks most of these in many files. Turn a ban on only after you fix the code it flags. `lint-rules/lint-config.test.ts` fails when a block loosens a rule for some files, so an ignore list doesn't get past it.
6. Point `lint-rules/lint-config.test.ts` at the app. The typed rules lint through the TypeScript project, so every path in its `files` list must be a real file of that kind. Create `src/shared/env.ts`, `src/shared/lib/log.ts`, a hook in `src/shared/ui/effects/` and one `server/` file. Petri's versions need `zod` and `@sentry/nextjs`. Set `generated` to `[]`, and to `["src/shared/supabase/database.types.ts"]` once step 2 commits that file.
7. Copy `.github/workflows/ci.yml`. Leave out the `boundaries`, `features`, `featuremap` and `e2e` jobs, and remove them and `unit` from `ci-ok`'s `needs`. Remove `boundaries`, `features` and `featuremap` from `scripts/check/gates.ts` too. `scripts/check/gates.test.ts` compares the gates with `ci.yml`, so change both together.
8. Rewrite the `src/features/blob/` paths in `.claude/hooks/lib/files.test.ts` to a file the app has. `unit`, and so `pnpm check`, stays red until step 4 adds the last of what its tests read:
   - `@playwright/test`, which the `unit` job runs to install Chromium, and the `src/shared/testing/` files, `scripts/new-feature.ts` and `.dependency-cruiser.cjs` that `lint-config.test.ts` reads (step 2)
   - `CLAUDE.md` (step 3)
   - `.claude/skills/postmortem/SKILL.md`, `scripts/agent-tools/workflow-limits.test.ts`, and a workflow that commits as the loop, which `scripts/check-pr/pull-request.test.ts` looks for (step 4)

   Until then, read the `unit` output of `pnpm check`. Only these tests may fail.
9. Open a PR with all of this, and merge it once `ci-ok` passes. `guardrails-ok` doesn't run on this PR. `guardrails.yml` runs on `pull_request_target`, which takes the workflow from `main`, and `main` doesn't have it yet.
10. Protect `main` and set the merge options:

    ```sh
    gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
    {"required_status_checks":{"strict":false,"checks":[{"context":"ci-ok","app_id":15368},{"context":"guardrails-ok","app_id":15368}]},"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
    JSON
    gh repo edit OWNER/REPO --enable-auto-merge --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
    gh api -X PATCH repos/OWNER/REPO -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK
    ```

    Each check is pinned to the GitHub Actions app (`app_id` 15368), so the loop's GitHub token can't post a passing status itself. `enforce_admins` makes the required checks bind the maintainer too. `strict: false` keeps auto-merge from stalling each time `main` moves. Deleting merged branches matches `evolution-pr-closed.yml`, which deletes an unmerged PR's `evo/` branch.

**Check.** Make each throwaway commit outside Claude Code, in a separate clone where you haven't run `pnpm install`. Otherwise lefthook stops the commit, and the copied command hook blocks `--no-verify` even in a human session. Open a throwaway PR for each rule (`any`, a comment, a `useEffect`, a protected-path edit from a branch named `evo/test`, a fake secret) and see its CI job fail. Close them afterwards. Petri's Phase 2 evidence in `PROGRESS.md` shows the full list.

## 2. Verification and the feature map

The checks need every feature in `src/features/<id>/`, with a `feature.manifest.ts`, `index.ts`, `README.md`, a unit test and an e2e test. Every `data-testid` inside the folder has to be a selector in its manifest, and every selector has to appear in the folder. An existing app has none of this, so a subagent plans the split first.

1. Copy the generic parts:
   - `scripts/verify.ts`, `scripts/verify/`, `scripts/featuremap.ts`, `scripts/featuremap/`, `scripts/check-featuremap.ts`, `scripts/check-featuremap/`, `scripts/check-features.ts`, `scripts/check-features/`, `scripts/check-boundaries.ts`, `scripts/check-boundaries/`, `scripts/new-feature.ts`, `scripts/new-feature/`, `.dependency-cruiser.cjs`, `playwright.config.ts`
   - `scripts/env-local.ts`, `scripts/env-local/` and `scripts/setup-secrets/plan.ts`, which `scripts/verify/server.ts` imports
   - `src/shared/lib/feature-manifest.ts`, `src/shared/testing/`
   - `.claude/skills/verify-app/`, `.claude/skills/maintain-feature-map/`, `.claude/skills/new-feature/`
2. Edit `package.json`. Copy the scripts `boundaries`, `features`, `featuremap`, `featuremap:check`, `new:feature`, `verify:*`, `e2e`, `env:local`, `db:start`, `db:stop` and `db:types`. Add the devDependencies `@playwright/test`, `dependency-cruiser`, `axe-core` and `supabase`, and the dependency `zod`.
3. Add `artifacts/`, `playwright-report/`, `test-results/`, `supabase/.branches/`, `supabase/.temp/` and `.claude/settings.local.json` to `.gitignore`. Verify writes its screenshots and reports to `artifacts/verify/`.
4. Create `src/features/registry.ts` with an empty `featureManifests` list, and run `pnpm featuremap` to write `FEATURE_MAP.md`.
5. Put the `boundaries`, `features` and `featuremap` jobs back in `ci.yml` and in `ci-ok`'s `needs`, and the gates back in `scripts/check/gates.ts`. They pass with an empty registry.
6. Adapt what is Petri's:
   - `scripts/new-feature/templates.ts` writes Tailwind classes and a `src/app/<route>/page.tsx`. Match the app's styling.
   - `scripts/check-features/manifests.test.ts` names Petri's four features.
   - The examples in the `verify-app` and `maintain-feature-map` skills use the blob's selectors and `feedback.post`.
   - `scripts/verify/server.ts` starts local Supabase and writes `.env.local` through `scripts/env-local/render.ts`. Change the env names in `render.ts`. If the app needs other services, start them in `server.ts`.
7. Ask a subagent for the plan. Paste this into Claude Code in the app's repo:

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

8. Move one feature at a time. Run `pnpm new:feature <id>`, move the feature's files in, add the `data-testid`s, fill in the manifest, and run `pnpm featuremap`. Then run `pnpm check` and `pnpm verify:flow <id>.<flow>`, and commit before you start the next feature. Code you move into a feature's `lib/` must keep the 80% coverage that `vitest.config.ts` sets.
9. Put the `e2e` job back in `ci.yml` and in `ci-ok`'s `needs`. It runs `db:start`, `db:types`, `env:local`, `e2e` and `verify:all`, and fails when `src/shared/supabase/database.types.ts` differs from what `pnpm db:types` writes. Create `src/shared/supabase/` and commit the file that `pnpm db:types` writes there. If the app has no Supabase schema, delete the "Generated database types match the migrations" step instead.

**Check.** `pnpm verify:all` passes, and you have read its screenshots. A `console.error` in a client component fails it. Verify reads only the browser console. Renaming one `data-testid` without its manifest fails `pnpm featuremap:check`.

## 3. CLAUDE.md and the trust ladder at level 0

1. Write the app's `CLAUDE.md` from Petri's. Keep the workflow, conventions, pull requests, hallucination and trust ladder sections. Replace the app description, the blob examples and the Supabase migration rule if the app has no migrations. Keep it under 150 lines.
2. Copy `.github/pull_request_template.md` and replace its `fix(blob)` example.
3. Copy `.evolution/config.json` with `"trustLevel": 0`. Set `productionUrl` and the `sentry` thresholds, which `scripts/evolution/config.ts` requires.
4. Copy `scripts/trust-report.ts`, `scripts/trust-report/` and the `trust-report` script. The ladder's thresholds are in `scripts/trust-report/ladder.ts`.

**Check.** `pnpm trust-report` prints level 0. It needs `gh` logged in and the repo on GitHub. A PR from a branch named `evo/test` that edits `.evolution/config.json` fails `protected-paths`.

## 4. The evolution loop

The loop needs somewhere for visitors' feedback and for the Timeline. Triage reads `feedback` and `events`. Create-issues, the build, pr-closed and post-merge write `feedback`. Post-merge writes `changelog`. Triage, the build, verify, post-merge, the guardian and the postmortem record their runs in `agent_runs`, which the gate and the weekly report read. The build uploads screenshots to the `verification-screenshots` bucket. The least work is to copy Petri's `feedback`, `timeline` and `analytics` features and the migrations that create their tables. If the app keeps its data somewhere else, give these tables a Supabase project of their own.

1. Copy the `feedback`, `timeline` and `analytics` features with what they need:
   - their folders in `src/features/`, the `src/shared/` code they import, and `supabase/migrations/`
   - their six route files in `src/app/`: `feedback/page.tsx`, `timeline/page.tsx`, `api/feedback/route.ts`, `api/feedback/[id]/vote/route.ts`, `api/feedback/[id]/report/route.ts` and `api/events/route.ts`
   - `supabase/seed.sql`, rewritten for the app. The timeline e2e test expects its seeded entries.
   - the dependencies `@supabase/supabase-js`, `server-only` and `@sentry/nextjs`
   - `SUPABASE_SERVICE_ROLE_KEY` and `RATE_LIMIT_SALT` in `src/shared/env.ts`, which Petri's reads through `src/shared/server-env-schema.ts`

   Then run `pnpm new:feature --registry-only` and `pnpm featuremap`.
2. Create the Supabase project. Copy `supabase/config.toml` and change its `project_id`. Copy `scripts/db-push-prod.ts` and the `db:push:prod` script, and run `pnpm db:push:prod` to apply the migrations. It needs `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF`, from the environment or `.env.setup`.
3. Copy the loop:
   - `.github/workflows/evolution-*.yml`, `evals.yml`, `claude-code-review.yml`, `claude.yml`, `.github/actions/app-stack/`
   - `scripts/evolution-*.ts`, `scripts/evolution/`, `scripts/agent-tools/`, `scripts/app-flags.ts`, `scripts/setup-secrets.ts`, `scripts/setup-secrets/`, `scripts/setup-labels.ts`, `scripts/setup-labels/`, `scripts/evals.ts`, `scripts/evals-report.ts`, `scripts/evals/`
   - `.evolution/prompts/`, `.claude/skills/` (the rest), `.claude/agents/`, `.claude/commands/`
   - the scripts `evolution:*`, `setup:*`, `evals`, `evals:report`, `app:flags` and `db:reset`, and the devDependency `js-yaml`
   - an empty `docs/agent-mistakes.md`. The postmortem throws unless it is in `HEAD`.
4. Set the Sentry release to the deployed commit, as Petri's `next.config.ts` (`release`) and `src/shared/lib/sentry-options.ts` do. The guardian takes the commit from the Vercel deployment's `meta.githubCommitSha` and queries Sentry for `release:<sha>`.
5. Once `pnpm check` passes, put `unit` back in `ci-ok`'s `needs`.
6. Replace the Petri names. `git grep -n -i -e petri -e blob -e Jaspyplayz` lists them. Among them are the prompts, the skills, `/evolve-once`, the `code-searcher` agent, the help text in `scripts/setup-secrets/plan.ts`, `supabase/seed.sql`, the `petri_voter` cookie, and the `petri-work` folder and `Petri` git identity in `scripts/evals.ts`.
   - Rename the commit identities `petri-evolution` (`evolution-build.yml`, `evolution-postmortem.yml`) and `petri-guardian` (`evolution-guardian.yml`) together with `agentPullRequests.authors` in `.github/guardrails.json`. `scripts/check-pr/pull-request.test.ts` fails when a workflow commits as a name that isn't listed there.
   - Keep what only looks like a match: git's `--blob` option in `.claude/hooks/lib/commands.ts`, `new Blob(` in `src/shared/lib/track.ts`, and the `petri/` lint rule names that `lint-rules/lint-config.test.ts` asserts.
7. Write new eval cases. Petri has two each for `verify-app`, `maintain-feature-map`, `investigate-before-claiming` and `build-evolution-issue`, in `evals/<skill>/cases/NN-name/` with a `task.md`, `setup.sh` and `rubric.md`. Most edit `src/features/blob/`. Keep the runner, and write two cases for each of those skills against the app's features. `investigate-before-claiming/cases/01-explain-repeat-vote` works unchanged if you copied `feedback` and kept the `petri_voter` name. Otherwise, update its rubric.
8. Do the account steps in `docs/MANUAL_STEPS.md`: the Claude GitHub App, the loop's GitHub token (`docs/MANUAL_STEPS.md` step 10) and `vercel link`. `pnpm setup:secrets` reads the Vercel project IDs from the `.vercel/project.json` that `vercel link` writes.
9. Run `pnpm setup:secrets --write-template` to regenerate `.env.setup.example`. Copy it to `.env.setup` and fill it in. Then run `pnpm setup:secrets --apply` and `pnpm setup:labels --apply`.
10. Set the optional repo variables if you want them. `HUMAN_MAINTAINERS` lists the logins whose `protected-ok` and `size-ok` labels count, and defaults to the repo owner. `EVALS_NIGHTLY` set to `true` turns on the nightly evals.
11. Merge the loop's PR. `evolution-verify.yml` runs on `pull_request_target`, so it posts its status only once it is on `main`. Then add `evolution-verify` to the required checks. It posts a status on every PR, `success` right away for one that isn't an evolution PR.

    ```sh
    gh api -X PATCH repos/OWNER/REPO/branches/main/protection/required_status_checks --input - <<'JSON'
    {"strict":false,"checks":[{"context":"ci-ok","app_id":15368},{"context":"guardrails-ok","app_id":15368},{"context":"evolution-verify","app_id":15368}]}
    JSON
    ```

12. Seed the cloud Supabase project, not the local one, the way Petri's Phase 6 dry run did: a vague item, a prompt-injection attempt and an oversized request. Give each item at least `minVotesToConsider` votes (2 in `.evolution/config.json`), or triage skips it.
13. Run the loop by hand at level 0, with the repo variable `EVOLUTION_ENABLED` set to `true`. Dispatch triage, build, the guardian and weekly with `workflow_dispatch`. The others start on events. Verify runs on each PR. Automerge runs after verify and CI and on its hourly cron, and merges nothing at level 0. Post-merge runs on each push to `main`, and pr-closed when an evolution PR closes. Bring the workflows up in this order: triage, build, verify and automerge, post-merge, the guardian as a dry run, then the guardian with `act`.
14. Move to level 1 only after the dry run passes. Then add the crons as a human, because the workflows are protected. Add `schedule:` to `evolution-triage.yml`, `evolution-build.yml` (a fallback, since merges and closes already dispatch the next build), `evolution-guardian.yml` (every 15 minutes) and `evolution-weekly.yml`. Add `push: branches: [main]` to `evolution-guardian-after-deploy.yml`. `docs/runbook.md` covers running the loop from then on.

**Check.** One feedback item reaches the Timeline through a PR that a human merged. Then merge a deliberately broken change as an evolution PR, one that raises a new unhandled error at least `minEvents` times (5 in `.evolution/config.json`) on production. The guardian rolls back, reverts and pauses, as in Petri's Phase 8 exit test. It reverts only an evolution merge. After any other merge it rolls back and stops with "there's no evolution change to revert".

## What stays in Petri

The blob, the Petri copy and Petri's eval cases stay, apart from `01-explain-repeat-vote`. So do the entries in `docs/decisions.md` and `docs/agent-mistakes.md`, although both are worth reading before you port. Most guards exist because an agent got past an earlier version. The app starts its own `docs/agent-mistakes.md` empty.
