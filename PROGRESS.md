# PROGRESS

**Current phase:** 1 ✅ merged (PR #1, 2026-10-22). Production Supabase is set up and verified (MANUAL_STEPS step 4 ✅).
**Local setup after a fresh clone:** `pnpm install && pnpm db:start && pnpm env:local && pnpm dev`.
**Next action:** Phase 2 step 2.1 on `chore/phase-2-guardrails`. Phase 3 note: screenshots must use `caret: "initial"` (see `docs/agent-mistakes.md`).

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

- [ ] 2.1 TS strict flags + bans · [ ] 2.2 ESLint flat config + custom rules (useEffect, no comments, no console, env, default exports) · [ ] 2.3 Import boundaries + server-only graph check · [ ] 2.4 `check-features.ts` · [ ] 2.5 `check-protected-paths.ts` · [ ] 2.6 PR size check · [ ] 2.7 gitleaks + pre-commit · [ ] 2.8 Vitest coverage floor + Playwright e2e w/ console-error fixture · [ ] 2.9 `ci.yml` + `ci-ok` · [ ] 2.10 `.claude/settings.json` hooks
- [ ] Exit: a throwaway commit for each rule turns its CI job red

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

`gitleaks git --log-opts="main..HEAD"` found 2 `jwt` hits: the public Supabase CLI demo keys (`iss: supabase-demo`) in `.env.example` (commit 5a834cf). They were removed and replaced by `pnpm env:local`, which generates `.env.local` from `supabase status`. The PR is squash-merged, so `main` never contains them. Note: the branch was pushed in the same command chain as that scan (`;` rather than `&&`). Phase 2's pre-commit hook and CI `secrets` job make that ordering mistake impossible.

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
