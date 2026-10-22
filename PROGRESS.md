# PROGRESS

**Current phase:** 2 in progress. PR #8 (`chore/phase-2-guardrails`) is green in CI and the Claude Code hooks are live, but the review findings below are still open.
**Local setup after a fresh clone:** `pnpm install && pnpm db:start && pnpm env:local && pnpm dev`.
**Next action (needs a human):** merge PR #8 (squash), then start Claude Code with `EVOLUTION_HUMAN=1` (see MANUAL_STEPS step 8). Then:
- Close the findings (2.11) in a follow-up PR.
- Rerun the protected-path throwaway against `main`, so `guardrails.yml` runs for real.
- Restart Claude Code without `EVOLUTION_HUMAN`.

Phase 3 starts only after that. Phase 3 note: screenshots must use `caret: "initial"` (see `docs/agent-mistakes.md`).

Resuming after a context reset? Read this file, then `CLAUDE.md`, `docs/decisions.md` and `docs/architecture.md`.

## Phase 0 — Recon and plan

- [x] 0.1 Check tools and install what's missing (see evidence below)
- [x] 0.2 `docs/architecture.md`: folder layout, data model, workflows, evolution-loop sequence diagram
- [x] 0.3 `PROGRESS.md`, `docs/decisions.md`, `docs/MANUAL_STEPS.md`
- [x] Exit: the docs exist and the plan matches `STARTER_PROMPT.md` (independent review below)

## Phase 1 — Scaffold (one folder per feature)

- [x] 1.0 Add `.env.setup` and `artifacts/` to `.gitignore`; pin `packageManager: pnpm@12.15.0`
- [x] 1.1 Scaffold Next.js + TS strict + Tailwind + Vitest + Playwright + Zod; Supabase CLI devDep, migrations for all tables, RLS, `supabase gen types`
- [x] 1.2 `pnpm new:feature <id>` generator
- [x] 1.3 Generate `blob`, `feedback`, `timeline`, `analytics`
- [x] 1.4 Feedback writes: Server Action/route + Zod + length cap + hashed-IP rate limit; service role server-only
- [x] 1.5 Sentry (no-op without DSN; release = commit SHA)
- [x] 1.6 Consolidate `docs/MANUAL_STEPS.md` + `pnpm setup:secrets`
- [x] Exit: `pnpm dev` shows all three pages working against local Supabase

## Phase 2 — Hard guardrails

- [x] 2.1 TS strict flags + bans · [x] 2.2 ESLint flat config + custom rules (useEffect, no comments, no console, env, default exports) · [x] 2.3 Import boundaries + server-only graph check · [x] 2.4 `check-features.ts` · [x] 2.5 `check-protected-paths.ts` · [x] 2.6 PR size check · [x] 2.7 gitleaks + pre-commit · [x] 2.8 Vitest coverage floor + Playwright e2e w/ console-error fixture · [x] 2.9 `ci.yml` + `ci-ok` (plus `guardrails.yml` + `guardrails-ok`) · [x] 2.10 `.claude/settings.json` hooks (live since f82cc71)
- [x] Exit: a throwaway commit for each rule turns its CI job red. All seven are red in CI: #9–#15 against the phase branch, and the protected-path one rerun against `main` as #16 once `guardrails.yml` was there (evidence below).
- [ ] 2.11 Close the open review findings (list below). They are all in protected files, so this needs a human-approved session (`EVOLUTION_HUMAN=1`).

## Phase 3 — Verification skill

- [ ] 3.1 `verify:up` · [ ] 3.2 `verify:flow` · [ ] 3.3 `verify:script` · [ ] 3.4 `verify:all` · [ ] 3.5 `verify:compare` · [ ] 3.6 `.claude/skills/verify-app/SKILL.md`
- [ ] Exit: `verify:all` green; injected `console.error` fails; screenshots described

## Phase 4 — Feature map

- [ ] 4.1 Manifest type + manifests · [ ] 4.2 `pnpm featuremap` → FEATURE_MAP.md · [ ] 4.3 CI `featuremap` job · [ ] 4.4 CLAUDE.md soft rule · [ ] 4.5 `maintain-feature-map` skill
- [ ] Exit: renaming a testid without updating the manifest fails CI

## Phase 5 — CLAUDE.md + trust ladder

- [ ] 5.1 CLAUDE.md (<150 lines) · [ ] 5.2 PR template · [ ] 5.3 `.evolution/config.json` level 0 · [ ] 5.4 `scripts/trust-report.ts`
- [ ] Exit: CLAUDE.md < 150 lines, template exists, level 0

## Phase 6 — Evolution loop

- [ ] 6.1 config + gate step · [ ] 6.2 triage · [ ] 6.3 build · [ ] 6.4 verify · [ ] 6.5 automerge + branch protection · [ ] 6.6 post-merge changelog · [ ] 6.7 local dry run (5 seeded items incl. vague, injection, oversized) → level 1
- [ ] Exit: one full feedback → Timeline loop with links

## Phase 7 — Skills, postmortems, evals

- [ ] 7.1 skills/agents/commands · [ ] 7.2 `docs/agent-mistakes.md` + postmortem · [ ] 7.3 `evals/` runner, judge, report, CI job
- [ ] Exit: ≥2 cases per core skill, one full eval run, one postmortem → lint rule

## Phase 8 — Safety, cost, kill switch

- [ ] 8.1 pause/resume + `app_flags` · [ ] 8.2 rate limits + caps · [ ] 8.3 secrets/env hygiene · [ ] 8.4 `docs/costs.md` + budget gate · [ ] 8.5 guardian (Sentry spike → rollback → revert → pause) · [ ] 8.6 moderation + report button
- [ ] Exit: kill switch stops a run, 429, gitleaks catches fake key, simulated spike → revert + pause

## Phase 9 — Long-run mode and handoff

- [ ] 9.1 crons on (after MANUAL_STEPS done) · [ ] 9.2 `docs/runbook.md` · [ ] 9.3 `docs/porting.md` · [ ] 9.4 red-team review + fixes

---

## Evidence

### Phase 2: open review findings (2026-10-22)

An independent fresh-context review of f82cc71 and the automated security reviews after f82cc71 found the gaps below. Every fix is in a protected path, so the live hooks block agent edits, which is the intended behaviour. They wait for a session started with `EVOLUTION_HUMAN=1`. "V" means the reviewer reproduced it.

CI (the hard gate):

1. **(V) PR code runs before the checks.** `next typegen` (in `lint`/`typecheck`) loads the unprotected `next.config.ts`, which can rewrite `eslint.config.mjs` on the runner while the git diff stays clean. `check-features.ts` imports agent-written manifests, `registry.ts` and `scripts/new-feature/templates.ts`, and a `process.exit(0)` in any of them passes. Fix: protect `next.config.*` and `scripts/**`, and read manifests statically.
2. **(V) Lint and fixture side doors.**
   - `const { useEffect } = React` and `globalThis.console` / `globalThis.process`.
   - `it.fails` and `context.skip()`.
   - A default import of `@playwright/test`, `fixtureTest.extend({ problems })` and `page.removeAllListeners`.
   - The lint-ignored `database.types.ts`.
3. **(V) A neutral folder bypasses the import boundaries.** For example, `src/bridge/` can re-export another feature. Fix: rules that list what's allowed, and only `app`, `features` and `shared` at the top of `src`.
4. **(V) Repo files can hide secrets and diff size.** `.gitattributes` `-diff`, `.gitleaksignore` and `gitleaks:allow` hide secrets from gitleaks, and binary numstat hides lines from `pr-size`. Fix: protect both files, run gitleaks with `--ignore-gitleaks-allow`, use `numstat --text`, and fail on binaries that can't be measured.
5. **Agent detection misses `claude/*` branches** and agent pushes to human PRs.
6. **(V) Config and trust level come from the merge base, not the base tip.**
7. **(V) Paths missing from the protected list:**
   - `.claude/settings.local.json`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.mcp.json`
   - `lefthook-local.yml`, `STARTER_PROMPT.md`
   - `server-env-schema.ts`, `supabase/config.toml`, `seed.sql`
   - Glob matching is also case-sensitive.
8. **Retargeting a PR doesn't re-run `ci.yml`.** Fix: add the `edited` type and `branches: [main]`, and make Phase 6 rulesets require the trusted workflows.
9. **Places that fail open.** A missing event payload counts as "not an agent PR", and a typegen crash in check-file is non-blocking.
10. **Weak proofs.**
    - The lint-config tests assert generic rule ids.
    - `DECLARES_A_TEST` is a regex.
    - Coverage measures only `lib/**/*.ts`.
    - Playwright `retries: 1` can hide intermittent console errors.
    - `hooks.test.ts` uses the real `blob-state.ts` as its clean sample, so `unit` fails whenever that file has a lint error (seen on throwaway #10).
    - Nits: `persist-credentials` and the unpinned checkout in `claude.yml`.

Claude Code hooks (the speed bump). **11, 12, the check-file half of 9 and the `hooks.test.ts` item in 10 are closed in `fix/phase-2-review-findings` (cb73d98).** Each has a regression case in `bypass.test.ts` or `hooks.test.ts`. Ten automated security-review rounds on the branch then closed more command-guard gaps (cb73d98 … round 10), each with a test, for 293 hook tests in total. decisions.md lists the classes the guard knowingly leaves open. It was verified live: the new matcher blocks a force push through Bash and through an MCP `ctx_execute` call.

11. **(V) Regression from d387f54.** The `$(...)`/backtick scanner isn't quote- or escape-aware, so `echo $(echo ")") ; git push --force` passes. The drafted fix is quote-aware scanners that fail closed on unterminated input, plus an old-vs-new parse differential test.
12. **(V) Gaps the guard misses:**
    - `GIT_CONFIG_COUNT/KEY_n/VALUE_n` and `include.path` set `core.hooksPath` or aliases.
    - Abbreviated long options (`--no-verif`, `--mirr`).
    - `lefthook uninstall`.
    - Printing secrets: bare `$GITHUB_TOKEN` or `$env:X`, `/proc/self/environ`, `${!n}`, `os.getenv`.
    - Root deletes: `rm -rf /usr/..` and `cd / && rm -rf *`.
    - Glob write targets.
    - `$(...)` in unquoted heredocs given to data sinks.
    - Writes to `~/.claude/settings.json`, with no `disableAllHooks: false` pin.
    - `Grep` with `glob: ".env*"` on a directory.
    - MCP code-execution tools bypass the `Bash|PowerShell` matcher.

### Phase 2 exit: throwaway PRs turn their CI job red (2026-10-22)

Each throwaway is one commit on c2cbd66, made in a scratch clone without lefthook. Each went to a draft PR against `chore/phase-2-guardrails` (CI ran on the merge with f82cc71) and was closed and its branch deleted afterwards. The failure messages come from the GitHub check-run annotations.

| PR | Breaks | Red job (other jobs green) | Failure |
|---|---|---|---|
| [#9](https://github.com/Jaspyplayz/petri/pull/9) ([run](https://github.com/Jaspyplayz/petri/actions/runs/39825930259)) | `useEffect` in `blob-creature.tsx` | `lint` → `ci-ok` | `'useEffect' import from 'react' is restricted. Effects live only in src/shared/ui/effects/.` |
| [#10](https://github.com/Jaspyplayz/petri/pull/10) ([run](https://github.com/Jaspyplayz/petri/actions/runs/39825932831)) | a comment in `blob-state.ts` | `lint`, `unit` → `ci-ok` | `No comments in src/. Rename things so the code explains itself…`. `unit` is red because `hooks.test.ts` uses this same file as its "clean file" sample, so the check-file hook (correctly) reports the comment. |
| [#11](https://github.com/Jaspyplayz/petri/pull/11) ([run](https://github.com/Jaspyplayz/petri/actions/runs/39825937961)) | `looseSort: any` in `feedback-sort.ts` | `lint` → `ci-ok` | `Unexpected any. Specify a different type` |
| [#12](https://github.com/Jaspyplayz/petri/pull/12) ([run](https://github.com/Jaspyplayz/petri/actions/runs/39825945348)) | `feedback` imports from `blob` | `boundaries` → `ci-ok` | `✖ feature-imports-another-feature: src/features/feedback/lib/feedback-sort.ts → src/features/blob/lib/blob-state.ts` |
| [#13](https://github.com/Jaspyplayz/petri/pull/13) ([run](https://github.com/Jaspyplayz/petri/actions/runs/39825952272)) | `timeline.e2e.ts` deleted | `features` → `ci-ok` | `✖ src/features/timeline: needs at least one e2e test in tests/*.e2e.ts` |
| [#14](https://github.com/Jaspyplayz/petri/pull/14) ([run](https://github.com/Jaspyplayz/petri/actions/runs/39825951675)) | agent PR (label `evolution`) sets `no-console` to `"warn"` | `protected-paths`: exit 1 on its real payload (below). `ci.yml` is green, as expected, because `guardrails.yml` can't run before it's on `main`. | `✖ eslint.config.mjs: guardrail file: agents can't change their own guardrails` |
| [#15](https://github.com/Jaspyplayz/petri/pull/15) ([run](https://github.com/Jaspyplayz/petri/actions/runs/39825957992)) | a random 40-char key in `docs/` | `secrets` → `ci-ok` | `leaks found: 1 · RuleID: generic-api-key` |

After PR #8 merged (1254574), the protected-path throwaway was rebuilt on `main` as [#16](https://github.com/Jaspyplayz/petri/pull/16) (label `evolution`). `guardrails.yml` ran from `main` ([run 39829398860](https://github.com/Jaspyplayz/petri/actions/runs/39829398860)): `protected-paths` failed, `guardrails-ok` failed, and `pr-size` passed:

```
protected-paths: PR #16 1254574...32c3f86 is an agent PR (label "evolution") and touches 1 protected path(s):
- ✖ eslint.config.mjs: guardrail file: agents can't change their own guardrails
```

### Phase 2: protected-paths and pr-size on real PR payloads (2026-10-22)

`guardrails.yml` can't run until it's on `main` (see decisions.md), so the check ran locally on each PR's real event payload (`gh api repos/Jaspyplayz/petri/pulls/N`), with the head fetched from `refs/pull/N/head`:

```
== PR #14 (labels: evolution, author: Jaspyplayz)
protected-paths: PR #14 c2cbd66...0094a1a is an agent PR (label "evolution") and touches 1 protected path(s):
- ✖ eslint.config.mjs: guardrail file: agents can't change their own guardrails
exit 1
== PR #8 (labels: , author: Jaspyplayz)
protected-paths: PR #8 90f3788...f82cc71 is not an agent PR, so guardrail files may change here.
exit 0
pr-size: PR #8 90f3788...f82cc71 is not an agent PR; 3782 changed lines (limit 400; 1 generated file(s) not counted).
pr-size: PR #14 c2cbd66...0094a1a has 2 changed lines (limit 400; 0 generated file(s) not counted).
```

### Phase 2: Claude Code hooks live in this session (2026-10-22, after f82cc71)

```
Bash  git push --force --dry-run nonexistent-remote main
      → PreToolUse:Bash hook error: Blocked: force pushes (-f, --force, ...) rewrite shared history.
Write .github/guardrails-probe.txt
      → PreToolUse:Write hook error: Blocked: .github/guardrails-probe.txt is a protected path
PowerShell  Write-Output "probe" | Out-File .github/guardrails-probe.txt
      → PreToolUse:PowerShell hook error: Blocked: .github/guardrails-probe.txt is a protected path
Read  .env.probe-does-not-exist
      → PreToolUse:Read hook error: Blocked: env and credential files hold secrets
Write src/features/blob/lib/zz-hook-probe.ts  (export const hookProbe: number = "not a number")
      → PostToolUse:Write hook blocking error: tsc --noEmit: error TS2322: Type 'string' is not assignable to type 'number'.
        (probe file deleted afterwards)
Edit  .claude/hooks/lib/shell.ts  (a real fix, see the findings above)
      → PreToolUse:Edit hook error: Blocked: .claude/hooks/lib/shell.ts is a protected path
```

Hook unit tests: `pnpm exec vitest run .claude/hooks` → 4 files, 145 tests passed.

### Phase 2: local gates (2026-10-22, f82cc71)

```
$ pnpm typecheck   → exit 0
$ pnpm lint        → exit 0
$ pnpm boundaries  → boundaries: ok (93 modules; import rules and client→server-only reachability checked)
$ pnpm features    → features: ok (analytics, blob, feedback, timeline)
$ pnpm test:coverage
 Test Files  24 passed (24)
      Tests  427 passed (427)
All files          |     100 |    97.56 |     100 |     100 |
```

PR #8 CI on f82cc71 ([run 39825875097](https://github.com/Jaspyplayz/petri/actions/runs/39825875097)): typecheck, lint, boundaries, features, unit, build, e2e (3m8s), secrets and `ci-ok` all passed, in 3m35s wall clock (17:48:22 → 17:51:57Z). The concurrency group cancelled the two superseded runs. On c2cbd66 ([run 39823622792](https://github.com/Jaspyplayz/petri/actions/runs/39823622792)) everything passed as well. The e2e job took 8m6s, 6m9s of it in `playwright install --with-deps` while the runner's apt mirror was slow (`Fetched 21.1 MB in 5min 58s (58.9 kB/s)`). The run before it finished e2e in 2m31s.

### Phase 1 — exit: `pnpm dev` against local Supabase, driven in a real browser (2026-10-22)

`pnpm db:reset` (migrations + seed), `pnpm dev --port 3000`, then a Playwright script poked, fed and renamed the blob, posted feedback, voted, sorted and opened the timeline, taking 7 screenshots (light + dark):

```
home: name=Blobby size=100% pokes=0
after: name=Gloop size=120% pokes=2 feeds=4
feedback items (top): 3,2,1,1,0
post message: Thanks! Your feedback is on the board.
my item votes before: 0
my item votes after: 1 pressed=true
timeline counter: 1 change shipped, 0 written by humans
timeline titles: Reverted: Bigger wobble on poke | Bigger wobble on poke | The blob blushes when you feed it
console errors/warnings/page errors: 0
```

What the screenshots show (checked by eye with the Read tool): the home page has the green blob centred under the Blob/Feedback/Timeline nav, sitting on its shadow, with Size/Pokes/Snacks stats, Poke and Feed buttons and the rename form. Mid-poke the eyes squint; after feeding the mouth opens into an "o", the heading reads "Gloop" and size is 120%. On /feedback the post form is above the board, the new post is first under "Newest" with 1 vote and a filled (pressed) vote button, and the seed items show Idea/Bug chips, Building/Triaged/Shipped/Rejected badges and issue/PR links. On /timeline the counter reads "1 change shipped, 0 written by humans" (2 changes − 1 revert), the revert card has a red "Reverted" badge, and the oldest entry lists the feedback behind it. In dark mode the theme inverts and the blob's face keeps dark eyes.

The first two exit runs found two real bugs, both fixed (see `docs/agent-mistakes.md`): CSS Modules were silently disabled by the Tailwind Turbopack loader rule (no wobble animation, blob floating above its shadow), and the blob face inverted in dark mode. A hydration warning was also traced to Playwright's `caret: "hide"` screenshot option (3/3 repro), not to the app.

### Phase 1 — local gates (2026-10-22)

```
$ pnpm typecheck            → next typegen && tsc --noEmit: 0 errors
$ pnpm lint                 → eslint: 0 problems
$ pnpm exec vitest run --coverage
      Tests  116 passed (116)
All files (features/*/lib) | 100 % lines
$ pnpm e2e                  → next build && next start, chromium, console-error fixture on every test
  19 passed (9.2s)
$ pnpm e2e -g "wobble animation"   (with the old "*.css" loader rule restored temporarily)
  ✘ Expected value: StringContaining "breathe" · Received array: ["none", "none"]   → regression test catches the CSS Modules bug
```

### Phase 1 — independent review (2026-10-22)

A fresh-context subagent reviewed `git diff main...HEAD` against STARTER_PROMPT Phase 1 and probed the local REST API. It confirmed that RLS, grants and storage deny anon writes, that no secrets are in `.next/static`, and that there are no Phase 2 rule violations (useEffect, comments, console, process.env, default exports, cross-feature imports). How each finding was resolved:

- MEDIUM, CSRF on write routes → fixed: same-origin + `application/json` guard on all three routes (403/415), with unit and e2e tests.
- MEDIUM, client-controlled XFF → kept on Vercel (which overwrites it); IPv6 is now bucketed by /64 (unit tests).
- MEDIUM, `/api/events` unlimited → fixed: 300/hour/IP rate limit (`event` action, migration 0005).
- MEDIUM, service-role key on Vercel previews → fixed: production only (unit test).
- LOW, `rate_limit_hits` never fully pruned → fixed in migration 0005; checked in SQL (stale row from another IP deleted, recent kept).
- LOW, Windows shell quoting in setup:secrets → fixed: all values via stdin (unit test with an injection string).
- LOW, mixed client/server barrels → declined, reason in decisions.md.
- LOW, generator registers folders without a manifest → fixed (checked with a stray folder).
- LOW, blob mood never resets → fixed via `animationend` (+ reduced-motion path), with e2e tests.
- LOW, timeline counter capped at 100 rows and counting reverted changes → fixed with exact counts minus reverts.

### First Vercel preview, verified in a real browser (2026-10-22)

Preview `petri-hmvrozlx7-jaspy-s-team.vercel.app` (PR #6, commit 681b930), checked in Chrome, logged in through Vercel's preview protection:

- `/`, `/feedback` and `/timeline` all render. Feedback and Timeline read the production Supabase project and show the empty state ("No feedback yet", "0 changes shipped, 0 written by humans").
- In-app navigation is a soft navigation (a `window` marker survived), and every `_rsc` fetch returned 200 per Resource Timing.
- Poke increments the counter (`pokes` = 1).
- `POST /api/events` returns a quiet `503 {"error":"unavailable"}`. Previews get no service-role key by design.
- Console: 0 messages from the app. The only entries came from one of the user's Chrome extensions.
- Vercel runtime logs for this deployment have 0 error/warning lines. The previous preview (before `writesOffResponse`) had sent 7 `ZodError` events to Sentry (PETRI-1). That also proves server errors reach Sentry end to end.
- Build fixes along the way: the project defaulted to framework "Other" (fixed with `vercel.json`), and Node is pinned to `24.x`.

### Production Supabase — migrations + anon probe (2026-10-22)

`pnpm db:push:prod` applied 5 migrations, no seeds; `migration list` shows local = remote for all 5. `list_tables`: 8 tables, RLS on for all, 0 rows apart from the 2 `app_flags`. Anon-key probe against `https://ejwwwasbkxqnyrjzlvll.supabase.co/rest/v1`. Every write probe would also have failed a CHECK, so a wrong grant could not have written a row.

```
1 read feedback public cols: 200 []
2 read author_hash:          401 42501
3 read votes:                401 42501
4 read events:               401 42501
5 read rate_limit_hits:      401 42501
6 read agent_runs:           401 42501
7 read changelog:            200 []
8 read app_flags:            200 feedback_open=true, read_only_mode=false
9 insert feedback:           401 42501
10 insert events:            401 42501
11 insert votes:             401 42501
12 update changelog:         401 42501
13 update app_flags:         401 42501
14 rpc consume_rate_limit:   401 permission denied for function consume_rate_limit
```

Advisors. Security: INFO only, `rls_enabled_no_policy` on agent_runs, events, feedback_reports, rate_limit_hits and votes. That is deliberate: they deny anon entirely and only the service role writes. Performance: INFO only, 9 `unused_index` (the database is empty).

### Phase 1 — secret scan (2026-10-22)

`gitleaks git --log-opts="main..HEAD"` found 2 `jwt` hits: the public Supabase CLI demo keys (`iss: supabase-demo`) in `.env.example` (commit 5a834cf). They were removed and replaced by `pnpm env:local`, which generates `.env.local` from `supabase status`. Correction (Phase 2): PR #1 was merged with a merge commit, not squashed, so 5a834cf is in `main`'s history. They are the CLI's public demo keys, not secrets. CI's `secrets` job scans only the commits a PR adds (see `docs/agent-mistakes.md`). Note: the branch was pushed in the same command chain as that scan (`;` rather than `&&`). Phase 2's pre-commit hook and CI `secrets` job make that ordering mistake impossible.

### Phase 1 — RLS / grants probe with the anon key against local REST (2026-10-22)

```
1 anon feedback public cols: 200 (vote_count 3,2,… maintained by trigger)
2 anon author_hash:          401 permission denied (column grant)
3 anon votes:                401 permission denied
4 anon insert feedback:      401 permission denied
5 anon changelog:            200
6 anon rpc rate limit:       401 permission denied for function consume_rate_limit
7 anon events insert:        401 permission denied
8 anon app_flags:            200
9 anon update changelog:     401 permission denied
```

API behaviour covered by e2e: oversized post → 413 (streamed body cap), 281 chars or a bad category → 400, unknown/invalid id vote → 404, repeat vote → 200 `{alreadyVoted:true}`, 6th post in an hour from one IP → 429 with `Retry-After: 3600`. Sentry: the build is clean without a DSN, and `GITHUB_SHA=deadbeef… pnpm build` puts the SHA into the client bundle (release).

### Phase 0 — tool check (2026-10-22)

```
node      v24.21.0
pnpm      12.15.0
git       git version 2.55.0.windows.5
gh        gh version 2.103.0 (2026-10-21)        # installed this phase (winget --scope user)
vercel    65.1.0                                 # installed this phase (npm -g)
supabase  2.121.0 (via npx; devDep in P1)
act       act version 0.2.89                     # installed this phase (winget --scope user)
gitleaks  8.30.1                                 # installed this phase (winget --scope user)
playwright Version 1.64.1 (chromium headless shell installed)
docker    MISSING (manual step 1: needs admin + WSL2 + reboot)        # P1: done, Docker 29.9.2 (Docker Desktop)
gh auth   NOT logged in (manual step 2)                                # P1: done, Jaspyplayz (scopes repo, workflow)
vercel    NOT logged in (manual step 2)                                # P1: done, jaspyplayz-5179
supabase  not logged in (manual step 2)                                # P1: done, org "Jaspy's Team"
git remote origin https://github.com/Jaspyplayz/petri.git — reachable (ls-remote: refs/heads/main f8b3e2e)
```

### Phase 0 — docs exist + diagrams render (2026-10-22)

```
$ wc -l docs/*.md PROGRESS.md
   34 docs/MANUAL_STEPS.md
  299 docs/architecture.md
   17 docs/decisions.md
   86 PROGRESS.md
$ npx @mermaid-js/mermaid-cli@11 -i <each mermaid block of architecture.md>
Generating single mermaid chart   # erDiagram      → d1.svg (207 KB, 0 "syntax error")
Generating single mermaid chart   # sequenceDiagram → d2.svg (56 KB, 0 "syntax error")
```

### Phase 0 — independent plan review (2026-10-22)

A fresh-context subagent compared the Phase 0 docs against `STARTER_PROMPT.md`. It confirmed that architecture.md has the folder layout, data model, workflow list and mermaid sequence diagram. It also confirmed that the layout matches Phase 1, every named table and field is present, the RLS plan matches, every workflow is listed, and no decision contradicts the prompt. Its findings and how each was resolved:

- MUST-FIX: the evidence section was empty → it was being written while the review ran. It's filled in above.
- MUST-FIX: next action said "wait" → the user explicitly asked to stop after Phase 0. The next action now names step 1.0.
- MUST-FIX: `evolution-verify` is a required check but only ran on evolution PRs → it now runs on every PR and reports success when it skips.
- NITs fixed: `building`/`rejected` status transitions; the bot token for every workflow-triggering write; the trust-lowering carve-out in protected paths; `PAUSED {until}` expiry; the budget check in the gate step; Storage upload, `verify:compare`, scope-creep fail and structured-issue-only in the diagram and table; the feature-folder shape note.
- Both mermaid diagrams re-rendered after the edits: 0 syntax errors.
