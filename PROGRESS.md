# PROGRESS

**Current phase:** 6 is in progress. Parts 1–9 (#34–#42, 14009db…2e47b27) and the `unit` job fix (#43) are on `main`, `EVOLUTION_BOT_TOKEN` is set, and branch protection is on (2026-10-23). 6.6 and 6.7 are left. Phase 5 is done once #31 (`pnpm check` and the PR template), #32 (`.evolution/config.json` at level 0 and `pnpm trust-report`) and #33 (CLAUDE.md) are on `main`; the exit checks pass (evidence below). Phase 4 is done: #27 (generator, 0120ab6), #28 (CI check, 34ff736) and #30 (the `maintain-feature-map` skill and the CLAUDE.md rule) are on `main`. The exit check passed on throwaway #29 (evidence below). Phase 3 is done: #21 (`verify:up`, 2f915f1), #22 (contrast fix, fa329d8), #23 (runner, a64c522), #24 (`verify:compare`, e74bdf3) and #25 (the `verify-app` skill) are on `main`. The exit checks pass (evidence below). Phase 2 is done: PR #8 and the review fixes #17, #18 and #19 are on `main` (7c30736).
**Local setup after a fresh clone:** `pnpm install && pnpm db:start && pnpm env:local && pnpm dev`.
**Next action:** Phase 6.6 (`evolution-post-merge.yml`: the changelog), then the 6.7 dry run, in a session started with `EVOLUTION_HUMAN=1` (MANUAL_STEPS step 9), because they write `.github/workflows/` and `scripts/`. Read `CLAUDE.md` and `FEATURE_MAP.md` first.

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
- [x] 2.11 Close the review findings (list below) from a human-approved session (`EVOLUTION_HUMAN=1`): #17 (hooks), #18 (CI gate) and #19 (lint, boundaries, test quality).

## Phase 3 — Verification skill

- [x] 3.1 `verify:up` (plus `verify:down`) · [x] 3.2 `verify:flow` · [x] 3.3 `verify:script` · [x] 3.4 `verify:all` (also in CI's e2e job) · [x] 3.5 `verify:compare` · [x] 3.6 `.claude/skills/verify-app/SKILL.md`
- [x] Exit: `verify:all` green; injected `console.error` fails; screenshots described (runner evidence below)

## Phase 4 — Feature map

- [x] 4.1 Manifest type + manifests (since Phase 1) · [x] 4.2 `pnpm featuremap` → FEATURE_MAP.md · [x] 4.3 CI `featuremap` job · [x] 4.4 CLAUDE.md soft rule · [x] 4.5 `maintain-feature-map` skill
- [x] Exit: renaming a testid without updating the manifest fails CI (throwaway #29, evidence below)

## Phase 5 — CLAUDE.md + trust ladder

- [x] 5.0 `pnpm check` (every local gate) · [x] 5.1 CLAUDE.md (<150 lines) · [x] 5.2 PR template · [x] 5.3 `.evolution/config.json` level 0 · [x] 5.4 `scripts/trust-report.ts`
- [x] Exit: CLAUDE.md < 150 lines, template exists, level 0 (evidence below)

## Phase 6 — Evolution loop

- [x] 6.1 config + gate step (#34) · [x] 6.2 triage (#35–#37) · [x] 6.3 build (#38, #39) · [x] 6.4 verify (#40, #41) · [x] 6.5 automerge (#42) + branch protection (applied 2026-10-23: `ci-ok`, `guardrails-ok` and `evolution-verify` required from GitHub Actions, admins included, squash only) · [ ] 6.6 post-merge changelog · [ ] 6.7 local dry run (5 seeded items incl. vague, injection, oversized) → level 1
- [ ] Exit: one full feedback → Timeline loop with links

## Phase 7 — Skills, postmortems, evals

- [ ] 7.1 skills/agents/commands · [ ] 7.2 `docs/agent-mistakes.md` + postmortem · [ ] 7.3 `evals/` runner, judge, report, CI job
- [ ] Exit: ≥2 cases per core skill, one full eval run, one postmortem → lint rule

## Phase 8 — Safety, cost, kill switch

- [ ] 8.1 pause/resume + `app_flags` · [ ] 8.2 rate limits + caps · [ ] 8.3 secrets/env hygiene · [ ] 8.4 `docs/costs.md` + budget gate · [ ] 8.5 guardian (Sentry spike → rollback → revert → pause) · [ ] 8.6 moderation + report button
- [ ] Exit: kill switch stops a run, 429, gitleaks catches fake key, simulated spike → revert + pause
- [ ] Follow-up from Phase 6: run agent-written and PR code (the builder's Bash commands, the verify `run` job) as a separate OS user without sudo or docker, so it can't read `CLAUDE_CODE_OAUTH_TOKEN` or a runtime token from another process of the job. In the verify `run` job, run the verify CLI from main's checkout and only the PR's app as that user, so the app can't write the evidence the judge reads (docs/decisions.md)
- [ ] Follow-up from Phase 6: `ci.yml` (no secrets) still restores the pnpm, Playwright and Next caches from main's scope, and untrusted code that runs in main's scope (the build agent job, the verify `run` job; both have sudo and docker on hosted runners) could write those keys. That would let it make `ci-ok` lie for later PRs. Fix: run untrusted code only in PR-scoped workflows, or stop restoring caches in `ci.yml`. Needs the user's OK, because it slows CI

## Phase 9 — Long-run mode and handoff

- [ ] 9.1 crons on (after MANUAL_STEPS done) · [ ] 9.2 `docs/runbook.md` · [ ] 9.3 `docs/porting.md` · [ ] 9.4 red-team review + fixes

---

## Evidence

### Phase 5 exit: CLAUDE.md, the PR template and level 0 (2026-10-22)

- `CLAUDE.md` is 59 lines (`wc -l`). It covers:
  - what Petri is, plus the links
  - the workflow and conventions
  - PRs and guarding against hallucination
  - the trust ladder, with its promotion criteria and rules
- `.github/pull_request_template.md` has the six sections: Why (feedback ids), What changed, Feature(s) touched, Verification report + screenshots, Risk, Rollback.
- `.evolution/config.json` is `{"trustLevel": 0}`. `pnpm trust-report` reads it: "Trust report: level 0 … No promotion: not yet: 0 of 3 evolution PRs merged".
- `pnpm check` ends with `check: ok (6 gates)`. In an earlier run, a type error in a test made it report `✖ typecheck` and `✖ unit`. It still ran the other four gates and exited 1.

### Phase 4 exit: renaming a testid fails CI (2026-10-22)

Throwaway PR #29 (closed unmerged, branch deleted) renamed `data-testid="blob-feed-button"` to `"blob-feed-btn"` in `blob-creature.tsx` and left the manifest alone. It was opened against `feat/check-featuremap` (#28), the same way Phase 2's exit checks ran against the phase branch. In [run 39893870160](https://github.com/Jaspyplayz/petri/actions/runs/39893870160), the `featuremap` job failed with:

```
✖ src/features/blob/components/blob-creature.tsx:142: data-testid "blob-feed-btn" isn't in the blob manifest's selectors
✖ blob manifest: selector feedButton ("blob-feed-button") isn't a data-testid anywhere in src/features/blob/
featuremap: 2 problem(s). …
```

`ci-ok` failed with it. `e2e` failed too, because `blob.feed` clicks that testid. Every other job passed.

### Phase 4: the CLAUDE.md rule, the `maintain-feature-map` skill and a map audit (2026-10-22)

- **CLAUDE.md** has two new soft rules:
  - Read `FEATURE_MAP.md` before any task, and use it to map vague feedback or a screenshot to a feature and a flow.
  - Update the manifest and run `pnpm featuremap` in the same change as a UI change, and never edit the map by hand.
- **`.claude/skills/maintain-feature-map/SKILL.md`** covers:
  - which manifest field to update for each kind of UI change
  - testid rules
  - never lowering `riskLevel`
  - how to write a flow
  - how to audit the map with a subagent that sees only the map
  
  Claude Code listed the skill as soon as the file existed.
- **The audit was run once, as the skill describes.** A general-purpose subagent got only `FEATURE_MAP.md` and the URL. It wrote one `verify:script` per feature, read every screenshot, and reported:
  - **Blob, Feedback and Timeline matched**: the layout and every always-present selector (11, 16 and 6 of them).
  - **One real gap:** the map said "Feedback" is in the "middle" of the top navigation and "Timeline" on the "right side". The links are grouped on the right, with the logo on the left. I checked the screenshot and fixed both `howToReach` lines.
  - **State-dependent selectors:** five weren't visible on a plain page load because they belong to other states (`blob-name-error`, `feedback-empty`, `feedback-form-message`, `feedback-vote-error`, `timeline-empty`). It reported them as state-dependent, not as errors. The skill's audit prompt now says how to treat those and gives the step format.
  - **Analytics** couldn't be checked from the screen, and the map says it's invisible.
- **A mistake while the audit ran:** I briefly checked out the throwaway exit-check branch, and verify rebuilt from it. The subagent threw away and reran the three runs from that window, and the results matched. It's in `docs/agent-mistakes.md`, and the skill now warns against it.

### Phase 4: the `featuremap` CI check (2026-10-22)

On the real repo, `pnpm featuremap:check` printed `featuremap: ok (FEATURE_MAP.md is current; 42 selectors match the data-testids in analytics, blob, feedback, timeline)`.

**Locally:** renaming `data-testid="blob-poke-button"` to `"blob-poke-btn"` in `blob-creature.tsx`, without touching the manifest, gave exit 1 and both sides of the mismatch:

```
✖ src/features/blob/components/blob-creature.tsx:139: data-testid "blob-poke-btn" isn't in the blob manifest's selectors
✖ blob manifest: selector pokeButton ("blob-poke-button") isn't a data-testid anywhere in src/features/blob/
```

Hand-editing `FEATURE_MAP.md` gave `✖ FEATURE_MAP.md is out of date (first difference at line 1); run pnpm featuremap and commit it instead of editing it by hand`. Both passed again after the revert.

**Tests:** `testids.test.ts` and `check.test.ts` (18 tests) cover:
- literal, conditional, object-property and template testids, with line numbers
- what a template pattern does and doesn't match
- computed testids being reported
- which files count as rendered code
- each problem message
- CRLF-insensitive freshness

### Phase 4: `pnpm featuremap` (2026-10-22)

- **4.1:** `src/shared/lib/feature-manifest.ts` has had every field Phase 4 lists since Phase 1, and all four manifests fill them in. The only change is blob's `howToReach`: it listed an alternative as step 2 ("Or click 'Blob'…"), which reads wrong once the map numbers the steps.
- **4.2:** `pnpm featuremap` printed `featuremap: wrote FEATURE_MAP.md (analytics, blob, feedback, timeline)`. The file has:
  - an overview table: feature, routes, where it is on screen, how to reach it, `data-testid`s, flows and risk
  - a mermaid page layout: the top navigation, a box per route holding its features, and analytics in "No page of its own"
  - a section per feature, with its selector table and the numbered steps of each flow
- **Tests:** `render.test.ts` checks the exact output for a two-feature fixture, including:
  - escaping of `|` in tables and `"` in mermaid
  - route order (`/` first) and a feature that appears on two routes
  - GitHub heading anchors
  - that the real manifests render the same way twice

### Phase 3: the `verify-app` skill (2026-10-22)

`.claude/skills/verify-app/SKILL.md` contains:
- frontmatter `name: verify-app`, with a description that starts with the spec's trigger sentence
- the protocol: reproduce with a screenshot first, change, re-run the flow and `verify:all`, read and describe the screenshots, compare for visible changes, attach the report, never claim success without a `PASS`, and after three failures comment and label the issue `evolution:stuck`
- the command reference, the script format, the failure lines, what catches people out (`caret: "initial"`, statuses from Playwright, flows that write, previews, Windows), and the optional MCP servers

Checks:
- **Its example script was run as written** (extracted from the markdown): `PASS script.skill-example (7 steps, 1.2 s)`.
- **Its failure lines** are the runner's exact formats, and its testids are the blob manifest's.
- **The `evolution:stuck` label it uses** was created in the repo (`B60205`, "Verification failed three times; an agent stopped and needs a human").

### Phase 3: `verify:compare` (2026-10-22)

`pnpm verify:compare origin/main` from `feat/verify-compare`. `origin/main` (e80d391) doesn't have #22's colour fix yet:

```
verify: installing origin/main (e80d391)'s dependencies in C:\Users\FSOS\AppData\Local\Temp\petri-verify-base\e80d3919c2c6
verify: before is origin/main (e80d391), built in C:\Users\FSOS\AppData\Local\Temp\petri-verify-base\e80d3919c2c6
verify: built the app in 9s
verify: after is this working tree
verify: the files or .next changed since verify built the app; rebuilding
verify: built the app in 6s
PASS blob.poke (before: fail) artifacts\verify\2026-10-23T01-54-04-479Z\compare\blob.poke
PASS blob.feed (before: fail) …
PASS blob.rename (before: fail) …
PASS feedback.browse (before: fail) …
PASS feedback.post (before: fail) …
PASS feedback.vote (before: fail) …
PASS timeline.browse (before: fail) …
compare: artifacts\verify\2026-10-23T01-54-04-479Z\compare.md
```

- Every base run fails on what #22 fixed, for example `a11y serious: color-contrast … on a[data-testid="nav-home"] … contrast of 3.59 (foreground color: #f6f3e7, background color: #2f8f6b …)`. Exit 0, because every flow passes after the change.
- Afterwards the base port (3201) doesn't answer and the working tree's app on 3200 still does.

**Side-by-side images, read with the Read tool** (2608×815 each, both screenshots at full size with captions):
- `blob.poke` step 02: both show Blobby at Size 100%, Pokes 0, Snacks 0. On the left (main) the active "Blob" nav pill and the "Feed" button are the lighter green. On the right they're the darker `culture-deep` green. Nothing else differs.
- `feedback.post` step 07: both show "Thanks! Your feedback is on the board." with the new "tiny hat" post at the top of Newest, and the right's "Feedback" pill is darker. The second card has 1 vote on the left and 0 on the right, because the after run sees the post the before run wrote to the shared local Supabase (decisions.md).

**Other paths:**

| Run | Result |
|---|---|
| `verify:compare origin/main blob.poke` again | skips the install, reuses the worktree, rebuilds the base in 5 s, `PASS blob.poke (before: fail)` |
| `verify:compare` / `nope` / `origin/main --base-url …` / `origin/main blob.nope` | exit 2: `expected a base ref` / `no commit for "nope"` / `doesn't take --base-url` / lists the flows |

Unit tests:
- `worktree.test.ts` uses throwaway git repos. It covers resolving branches, `HEAD~1` and short shas, and rejecting unknown refs and option-like ones such as `--output=…`. It checks out once and reuses, replaces an older base, leaves worktrees outside its folder alone, recreates a deleted one, reports git failures, and copies `.env.local`.
- `compare.test.ts` covers step pairing when the base stopped early, HTML escaping, `compare.md`, and real Chromium composing two screenshots into a 2608 px wide PNG. That's 92 verify tests in total.

### Phase 3: the runner, `verify:flow` / `verify:script` / `verify:all` (2026-10-22)

**The first `verify:all` failed all 7 flows on axe `color-contrast`.** Light text on the `culture` green measured 3.59:1 and the Rejected badge 4.45:1, against the 4.5:1 that WCAG AA needs. There were no console, network or page errors. #22 fixes the colours. With it:

```
PASS blob.poke (6 steps, 1.0 s) artifacts\verify\2026-10-23T01-44-14-878Z\blob.poke\report.md
PASS blob.feed (5 steps, 0.9 s) …
PASS blob.rename (5 steps, 0.9 s) …
PASS feedback.browse (6 steps, 1.3 s) …
PASS feedback.post (7 steps, 1.4 s) …
PASS feedback.vote (4 steps, 1.1 s) …
PASS timeline.browse (5 steps, 0.7 s) …
summary: artifacts\verify\2026-10-23T01-44-14-878Z\summary.md
```

**Exit check: injected `console.error` fails.**
- With `console.error("verify exit check: deliberate error on poke")` added to the blob's poke handler, `pnpm verify:flow blob.poke` printed `FAIL blob.poke` and `✖ console.error: verify exit check: deliberate error on poke`, and exited 1.
- After reverting the line it printed `PASS`.
- The check-file hook also flagged the line while it was in.

**Exit check: screenshots, read with the Read tool.**
- `feedback.post` step 07: the Feedback nav pill is active and the form has reset (placeholder, "280 characters left", Post greyed out). The green confirmation reads "Thanks! Your feedback is on the board.", "Newest" is selected, and the top card is "Verification flow: give the blob a tiny hat" with 0 votes and Idea and New badges.
- `timeline.browse` step 05: the counter reads "1 change shipped, 0 written by humans", the first card has a red "Reverted" badge ("Reverted: Bigger wobble on poke", PR #6, c3d4e5f), and "Bigger wobble on poke" (PR #5) follows.
- `blob.rename` step 05: the heading and the input both say "Gloop", and the stats read Size 100%, Pokes 0, Snacks 0.

**Other paths:**

| Run | Result |
|---|---|
| `verify:script` with a 7-step JSON script (a blank name shows the error, then Enter saves "Wobbles") | `PASS script.rename-check (7 steps, 1.2 s)` |
| `verify:flow blob.poke --base-url http://127.0.0.1:3200` | PASS without touching the server |
| `pnpm build` run under a server that verify started | the next run says `the files or .next changed since verify built the app; rebuilding`. Before the `BUILD_ID` check it reused the server and every page got a 500 for a JS chunk. |
| `verify:flow blob.nope` / `--base-url ftp://x` / `verify:script package.json` / `verify:all --nope` | exit 2: lists the flows / `isn't an http(s) URL` / names the unknown keys and the missing `steps` / `Unknown option '--nope'` |

Unit tests:
- `runner.test.ts` drives real Chromium against a local fixture server. A clean page passes, with a PNG per step, `report.json` matching the returned report, and vitals recorded.
- One page each for console.error, page error, 404, an unnamed button (axe `button-name`, recorded once across two steps), and `class="card undefined"`. Each fails with its exact message.
- A failed `expectText` stops the run and says what the element shows, and a missing testid is named.
- Every `.screenshot(` call passes `screenshotOptions` with `caret: "initial"`.
- `steps`, `problems` and `report` tests cover flow resolution, script parsing, the fail rules and the markdown. That's 77 verify tests in total.

### Phase 3: `verify:up` (2026-10-22)

Run on this machine against the real app and local Supabase (Docker):

| Situation | Result |
|---|---|
| Nothing running | `verify: built the app in 6s` → `http://127.0.0.1:3200`; `/`, `/feedback` and `/timeline` return 200 |
| Run again, no changes | `verify: reusing the app at http://127.0.0.1:3200 (built from the current files)`, 1.1 s |
| A new untracked file in `src/` | `verify: files changed since the last build; restarting the app` → rebuilt |
| `verify:down`, twice | `verify: stopped the app` (the port stops answering), then `verify: no app was running` |
| Supabase stopped (`pnpm db:stop`) | `verify: starting local Supabase …` → app up in 31 s; `supabase.log` has 0 lines with "key" |
| Port held by another server (`VERIFY_PORT=3201`) | exit 2: `port 3201 is in use by a server verify didn't start; stop it or set VERIFY_PORT` |
| `VERIFY_PORT=abc` / unknown command | exit 2 with the error / the usage text |

The build is fast because Turbopack reuses its cache in `.next`. Unit tests: `fingerprint.test.ts` (a real temp git repo: tracked, untracked and env-file changes count; tests, markdown and ignored files don't; a deleted tracked file counts) and `server-plan.test.ts` (reuse, rebuild, port taken, the never-kill-a-stale-pid case, bad state files).

### Phase 2: review findings, all closed (2026-10-22)

An independent fresh-context review of f82cc71 and the automated security reviews after f82cc71 found the gaps below. Every fix is in a protected path, so the live hooks block agent edits, which is the intended behaviour. They were fixed in a session started with `EVOLUTION_HUMAN=1` and merged as #17, #18 and #19 (squash, in that order). Each PR was green in CI and had no automated-review findings when it merged. CI on `main` was green after each merge: d30c82e ([run](https://github.com/Jaspyplayz/petri/actions/runs/39881614714)), 87f15bf ([run](https://github.com/Jaspyplayz/petri/actions/runs/39882031153)) and 7c30736 ([run](https://github.com/Jaspyplayz/petri/actions/runs/39882359728)). "V" means the reviewer reproduced it.

CI (the hard gate). **1, 4–8, the payload half of 9, the `database.types.ts` item in 2 and the nits in 10 are closed in #18. The rest of 2, 3 and the rest of 10 (lint side doors, boundaries, test quality) are closed in #19.** Each closed item has a test in `scripts/**/*.test.ts`. 8 adds the `edited` trigger, but not the `branches: [main]` filter (see decisions.md).

1. **(V) PR code runs before the checks.** `next typegen` (in `lint`/`typecheck`) loads the unprotected `next.config.ts`, which can rewrite `eslint.config.mjs` on the runner while the git diff stays clean. `check-features.ts` imports agent-written manifests, `registry.ts` and `scripts/new-feature/templates.ts`, and a `process.exit(0)` in any of them passes. Fix: protect `next.config.*` and `scripts/**`, and read manifests statically.
2. **(V) Lint and fixture side doors.** **Closed in #19, except `database.types.ts` (closed in #18).**
   - `const { useEffect } = React` and `globalThis.console` / `globalThis.process`.
   - `it.fails` and `context.skip()`.
   - A default import of `@playwright/test`, `fixtureTest.extend({ problems })` and `page.removeAllListeners`.
   - The lint-ignored `database.types.ts`.
3. **(V) A neutral folder bypasses the import boundaries.** **Closed in #19.** For example, `src/bridge/` can re-export another feature. Fix: rules that list what's allowed, and only `app`, `features` and `shared` at the top of `src`.
4. **(V) Repo files can hide secrets and diff size.** `.gitattributes` `-diff`, `.gitleaksignore` and `gitleaks:allow` hide secrets from gitleaks, and binary numstat hides lines from `pr-size`. Fix: protect both files, run gitleaks with `--ignore-gitleaks-allow`, use `numstat --text`, and fail on binaries that can't be measured.
5. **Agent detection misses `claude/*` branches** and agent pushes to human PRs.
6. **(V) Config and trust level come from the merge base, not the base tip.**
7. **(V) Paths missing from the protected list:**
   - `.claude/settings.local.json`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.mcp.json`
   - `lefthook-local.yml`, `STARTER_PROMPT.md`
   - `server-env-schema.ts`, `supabase/config.toml`, `seed.sql`
   - Glob matching is also case-sensitive.
8. **Retargeting a PR doesn't re-run `ci.yml`.** Fix: add the `edited` type and `branches: [main]`, and make Phase 6 rulesets require the trusted workflows. **Closed in Phase 6 without a ruleset:** `ci.yml` has the `edited` type, and the other two required checks (`guardrails-ok`, `evolution-verify`) run on `pull_request_target`, so they come from main. An agent PR that changes anything `ci-ok` runs (`.github/**`, `package.json`, `scripts/**`, the test and lint configs) fails `guardrails-ok` until a human adds `protected-ok` (decisions.md, 2026-10-23).
9. **Places that fail open.** A missing event payload counts as "not an agent PR", and a typegen crash in check-file is non-blocking.
10. **Weak proofs.** **The lint-config, `DECLARES_A_TEST`, coverage and retries items are closed in #19.** Evidence there: every new lint case fails against `main`'s config (25 of 25), and `rules.test.ts` fails against `main`'s dependency-cruiser config.
    - The lint-config tests assert generic rule ids.
    - `DECLARES_A_TEST` is a regex.
    - Coverage measures only `lib/**/*.ts`.
    - Playwright `retries: 1` can hide intermittent console errors.
    - `hooks.test.ts` uses the real `blob-state.ts` as its clean sample, so `unit` fails whenever that file has a lint error (seen on throwaway #10).
    - Nits: `persist-credentials` and the unpinned checkout in `claude.yml`.

Claude Code hooks (the speed bump). **11, 12, the check-file half of 9 and the `hooks.test.ts` item in 10 are closed in #17.** Each has a regression case in `bypass.test.ts` or `hooks.test.ts`. Twelve automated security-review rounds on the branch then closed more command-guard gaps (cb73d98 … round 12), each with a test, for 304 hook tests in total. decisions.md lists the classes the guard knowingly leaves open. It was verified live: the new matcher blocks a force push through Bash and through an MCP `ctx_execute` call.

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
