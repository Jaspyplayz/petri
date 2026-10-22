# PROGRESS

**Current phase:** 0 — Recon and plan ✅ (exit criteria passed). The user asked to stop after Phase 0.
**Next action:** Phase 1 step 1.0. The manual steps in `docs/MANUAL_STEPS.md` (Docker, CLI logins) unblock local Supabase and PRs, but Phase 1 can start before they're done.

Resuming after a context reset? Read this file, then `CLAUDE.md`, `docs/decisions.md` and `docs/architecture.md`.

## Phase 0 — Recon and plan

- [x] 0.1 Check tools and install what's missing (see evidence below)
- [x] 0.2 `docs/architecture.md`: folder layout, data model, workflows, evolution-loop sequence diagram
- [x] 0.3 `PROGRESS.md`, `docs/decisions.md`, `docs/MANUAL_STEPS.md`
- [x] Exit: the docs exist and the plan matches `STARTER_PROMPT.md` (independent review below)

## Phase 1 — Scaffold (one folder per feature)

- [ ] 1.0 Add `.env.setup` and `artifacts/` to `.gitignore`; pin `packageManager: pnpm@12.15.0`
- [ ] 1.1 Scaffold Next.js + TS strict + Tailwind + Vitest + Playwright + Zod; Supabase CLI devDep, migrations for all tables, RLS, `supabase gen types`
- [ ] 1.2 `pnpm new:feature <id>` generator
- [ ] 1.3 Generate `blob`, `feedback`, `timeline`, `analytics`
- [ ] 1.4 Feedback writes: Server Action/route + Zod + length cap + hashed-IP rate limit; service role server-only
- [ ] 1.5 Sentry (no-op without DSN; release = commit SHA)
- [ ] 1.6 Consolidate `docs/MANUAL_STEPS.md` + `pnpm setup:secrets`
- [ ] Exit: `pnpm dev` shows all three pages working against local Supabase

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
docker    MISSING (manual step 1: needs admin + WSL2 + reboot)
gh auth   NOT logged in (manual step 2)
vercel    > Run `vercel deploy --temporary` ... or `vercel login` to log in.   # NOT logged in (manual step 2)
supabase  not logged in (no ~/.supabase/access-token) (manual step 2)
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
