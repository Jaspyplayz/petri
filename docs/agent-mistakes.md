# Agent mistakes

Every observed agent mistake gets an entry: what happened, evidence, root cause, category, and the fix rung reached (design → hard rule → skill → CLAUDE.md). Phase 7 adds the `postmortem` skill and eval cases; these first entries come from building Phase 1.

## 2026-10-22 · CSS Modules silently empty under the Tailwind Turbopack rule

- **What happened:** The blob's wobble/breathe animations and scale origin never applied. `styles.creature` was `undefined`, so the SVG groups had no class. Unit and e2e tests were green because they only checked counters.
- **Evidence:** Phase 1 exit check on `pnpm dev`: the blob floated ~38 px above its shadow; computed `transform-origin: 0px 0px`, `class=null`. The production CSS still contained the rules, but the JS mapping was empty.
- **Root cause:** `next.config.ts` (copied from the create-next-app template) applied the `@tailwindcss/turbopack` loader to `"*.css"`, which also captured `*.module.css` and turned off CSS Modules for them.
- **Category:** config / silent styling failure
- **Fix rung:** (a) design: the loader rule is now scoped to `globals.css`. (b) hard rule: `blob.e2e.ts` asserts the computed `animationName` contains `breathe`, then `wobble` after a poke, and that the blob sits on its shadow. Shown to fail (`["none","none"]`) with the old rule.
- **Follow-up (Phase 3/4):** `verify:flow` should flag elements whose `className` contains `undefined`, so any feature catches this class of bug.

## 2026-10-22 · Hydration "mismatch" caused by Playwright screenshots, not the app

- **What happened:** A screenshot taken right after `page.goto` (load event, before hydration) logged a React hydration error on the blob name input: `style={{caret-color:"transparent"}}`.
- **Evidence:** It reproduced 3/3 with Playwright's default `caret: "hide"` and 0/3 with `caret: "initial"` or with no screenshot (probe script, Phase 1 exit check).
- **Root cause:** Playwright hides the text caret by writing an inline style on inputs. If that happens before React hydrates, React sees an attribute the server didn't render.
- **Category:** verification tooling false positive
- **Fix rung:** (c) skill/tooling: `verify:flow` and `verify:script` (Phase 3) must take screenshots with `caret: "initial"`. A hard check for that goes in the verify CLI's own tests.

## 2026-10-22 · Chrome-extension network panel reported 503s that never happened

- **What happened:** While checking the first Vercel preview, the Claude-in-Chrome network panel listed `GET /feedback?_rsc=…`, `GET /timeline?_rsc=…`, `OPTIONS /` and `HEAD /feedback` as 503.
- **Evidence:** In the same tab, `performance.getEntriesByType("resource")` shows every `_rsc` fetch with `responseStatus` 200, a soft navigation kept a `window` marker (no reload), direct `HEAD`/`OPTIONS` returned 200/204, and Vercel runtime logs had no matching requests. The only real 503 was `/api/events` (see below).
- **Root cause:** The extension's network capture attributes statuses unreliably. The OPTIONS and HEAD requests come from the Vercel preview toolbar.
- **Category:** verification tooling false positive
- **Fix rung:** (c) skill/tooling: the Phase 3 verify skill takes HTTP statuses from Playwright's `response.status()` or the Resource Timing API, never from the extension's network panel.

## 2026-10-22 · PROGRESS claimed PR #1 was squash-merged; it was merge-committed

- **What happened:** The Phase 1 secret-scan evidence said "the PR is squash-merged, so `main` never contains" the public Supabase demo JWTs. In fact PR #1 was merged with a merge commit, so 5a834cf, which contains them, is in main's history.
- **Evidence:** `git merge-base --is-ancestor 5a834cf origin/main` succeeds (checked in Phase 2).
- **Root cause:** The claim was written from the intended merge method, not checked against git.
- **Category:** unverified claim in evidence
- **Impact:** Low. These are the Supabase CLI's public demo keys (`iss: supabase-demo`), identical on every machine, not secrets. But a full-history gitleaks scan will always flag them.
- **Fix rung:** (a) design: CI's `secrets` job scans only the commits a PR or push adds. PROGRESS is corrected. Follow-up for Phase 6: branch protection allows squash merges only, and the evolution loop already uses `--squash`.

## 2026-10-22 · `test.fail()` "proved" the console-error fixture with the wrong failure

- **What happened:** The first fixture self-test used `test.fail()` and passed. It passed only because `E2E_BASE_URL` was set to an empty string, so the test failed on an invalid URL, not because the fixture caught the console error.
- **Root cause:** `test.fail()` accepts any failure, so an expected-failure test proves nothing about why it failed.
- **Category:** verification false positive
- **Fix rung:** (b) hard rule: two strict self-tests assert the exact strings the fixture records (`console.error: …`, `pageerror: …`), and the expected-failure test first polls until exactly one problem is recorded. The JSON report confirmed the failure is the fixture's "browser console errors or uncaught page errors".

## 2026-10-22 · Printed `supabase status` output into the conversation

- **What happened:** While checking the local stack, `supabase status` was run without redirecting its output. It prints the local service-role and anon keys.
- **Impact:** Low: these were the local CLI demo keys, not production secrets. But the habit leaks real keys elsewhere.
- **Category:** secret hygiene
- **Fix rung:** (b) hard rule: the `guard-commands` Claude Code hook blocks `supabase status` (plus `printenv`, `env` dumps, `gh auth token` and echoing secret-named variables). `pnpm env:local` reads the status for you.

## 2026-10-22 · Lint passed locally but failed in CI (stale generated types)

- **What happened:** The first CI run on PR #8 failed `lint` and `unit` with "Unsafe member access .params on a type that cannot be resolved" in `src/app/api/feedback/[id]/vote/route.ts`.
- **Root cause:** Route files use the global `RouteContext`/`PageProps` types that `next typegen` writes to `.next/types`. Locally that folder was left over from earlier builds; a fresh checkout doesn't have it, and only `typecheck` ran typegen.
- **Category:** environment drift
- **Fix rung:** (a) design: `pnpm lint` runs `next typegen` first, lefthook runs typecheck before lint, and the check-file hook generates the types when they're missing. Checked by deleting `.next/types`: the old script exits 1, the new one exits 0.

## 2026-10-22 · Every preview page view would have sent an error to Sentry

- **What happened:** Previews deliberately get no service-role key, so `/api/events` failed `serverEnv()` and called `log.error` on every page view.
- **Root cause:** The write handlers treated "secrets intentionally absent on preview" the same as "secrets missing in production".
- **Category:** observability noise / design gap
- **Fix rung:** (a) design: `writesOffResponse()` (shared) returns a quiet `503 unavailable` when `VERCEL_ENV=preview` lacks the secrets, and stays loud (`log.error` → Sentry) anywhere else. `writeAvailability` is unit-tested for all three cases.

## 2026-10-22 · Turned the hooks on before the guardrail reviews were finished

- **What happened:** `.claude/settings.json` went live (f82cc71) while an automated security review and an independent review of the guardrails were still running. Both came back with real gaps in protected files, including a regression from d387f54: the new `$(...)` scanner isn't quote-aware, so `echo $(echo ")") ; git push --force` gets past the command guard. From then on the hooks (correctly) refused every edit to `.claude/hooks/**` and the other guardrail files, so none of the fixes could land without a human.
- **Evidence:** the PreToolUse hook blocked the drafted `shell.ts` fix ("Blocked: .claude/hooks/lib/shell.ts is a protected path").
- **Root cause:** Activation was treated as one more step, not as the point where agent edits to guardrails stop. A parser change to a security control also shipped without a test that compares the new parse with the old one.
- **Category:** sequencing / verification gap
- **Fix rung:** (c) process: turn guardrails on last, after every review of them has settled. Changes to a guard's parser need differential tests (old parse vs new parse on the same attack table) before they merge. The open findings are listed in PROGRESS.md and wait for a human-approved session.

## 2026-10-22 · Low-contrast text shipped in Phase 1 because nothing checked contrast

- **What happened:** Light text on the `culture` green (primary buttons, the active nav link, the voted button, the Shipped badge) and the Rejected badge's grey text were all under WCAG AA. Lint (jsx-a11y), unit and e2e tests were green.
- **Evidence:** The first `pnpm verify:all` failed all 7 flows on axe `color-contrast`: 3.59:1 (`#f6f3e7` on `#2f8f6b`) and 4.45:1 (`#55625a` on `#dad8c7`), where 4.5:1 is needed.
- **Root cause:** jsx-a11y checks markup, not rendered colours. No check ran axe on the rendered pages until the verify runner existed.
- **Category:** verification gap
- **Fix rung:** (b) hard rule: the verify runner runs axe after every step and fails on serious and critical violations, and CI's e2e job runs `pnpm verify:all`. #22 fixes the colours (`culture-deep`, 5.77:1).

## 2026-10-22 · `verify:up` reused a server whose `.next` another build had replaced

- **What happened:** `verify:up` reported the server as current and reused it, but every page got a 500 for a JS chunk, so all 7 flows failed.
- **Evidence:** `pnpm e2e` (which runs `next build`) ran on another branch while the verify server was up. The source fingerprint still matched, but `.next` now held a different build.
- **Root cause:** The reuse rule covered the inputs of the build but not the build output the server reads from disk.
- **Category:** design gap in verification tooling (caught while developing it, before merge)
- **Fix rung:** (a) design: the server state records `.next/BUILD_ID`, and any change means stop and rebuild. `server-plan.test.ts` covers it.

## 2026-10-22 · A git-spawning test relied on Vitest's 5 s default and flaked in CI

- **What happened:** The `worktree.test.ts` test "resolves branches, relative refs and shas" timed out at 5.6 s in #25's `unit` job, then passed on a rerun. It had passed in #24's CI.
- **Evidence:** Each test in that file builds a real git repo, so it spawns several git processes. With coverage on, alongside the Chromium tests, the neighbouring cases took 0.4–1.4 s each, against a few milliseconds for the pure ones. Locally the whole file runs in 1.4 s.
- **Root cause:** Tests that do real process I/O were given the default budget meant for pure tests. `runner.test.ts` (real Chromium) already had a 30 s budget; the new file didn't follow it.
- **Category:** flaky test (timing under CI load)
- **Fix rung:** (a) design: the git-spawning `describe` blocks get `{ timeout: 30_000 }`, like `runner.test.ts`. The assertions are unchanged.

## 2026-10-22 · Switched branches while a subagent was verifying against the same working tree

- **What happened:** While the feature-map audit subagent was running `verify:script`, I stashed my work and checked out a throwaway branch that renames `blob-feed-button`, to push the Phase 4 exit-check PR. About a minute later I switched back.
- **Evidence:** `artifacts/verify/build.log` shows a rebuild at 23:12:03 local, inside that window. `verify:up` rebuilds from whatever is checked out, so audit runs in the window tested the throwaway code.
- **Root cause:** `verify:*` serves the shared working tree, and nothing marks it as in use by a running subagent. Pushing a branch didn't need a checkout at all.
- **Category:** concurrency between the main agent and a subagent that share one working tree
- **Fix rung:** (c) skill: `maintain-feature-map` now says not to check out branches or edit app code while an audit runs, and to do side work in a separate `git worktree`. I told the subagent to discard and rerun anything from that window.
