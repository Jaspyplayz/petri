# Agent mistakes

Every observed agent mistake gets an entry: what happened, evidence, root cause, category, and the fix rung reached (design → hard rule → skill → CLAUDE.md). The `postmortem` skill (or `/postmortem`) writes them, climbs that ladder and adds an eval case. The first entries come from building Phase 1.

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
## 2026-10-23 · Typed a pinned action SHA from memory

- **What happened:** In the new `evolution-post-merge.yml` I wrote `actions/upload-artifact@cf430e0371e4cd1a7e64d3ea6e8a0c0ae95b2b08 # v7.0.2`. That SHA isn't the repo's pin. The comment's version was right, the SHA was invented.
- **Evidence:** `ci.yml:138` and `evolution-build.yml:79` pin `cf430e030ddbb5b0abf93d22962f4752f3646cd9`. I caught it by grepping the other workflows before committing.
- **Root cause:** I wrote the line from memory instead of copying it from an existing workflow. Nothing local checks action pins, so CI would have been the first to fail (the action can't be resolved).
- **Category:** hallucinated identifier (a commit SHA)
- **Fix rung:** none yet, logged only. The working rule is to copy `uses:` lines from an existing workflow. If it happens again, the next rung is (b) a hard rule: a guardrail test that resolves every pinned `uses:` SHA in `.github/workflows/`.

## 2026-10-23 · The build agent guessed the timing of a screenshot meant to prove a blink

- **What happened:** For #47 (the blob blinks), the build agent wrote a `blob.blink` flow that waits 4700 ms and takes a "during-blink" screenshot, aiming for 94% of the 5 s cycle. `evolution-verify` failed PR #49, because no screenshot showed the eyes closed.
- **Evidence:** Paused at 95% of its cycle, the eyelid's computed opacity is 1. A local `verify:flow blob.blink` passes, but its step-05 screenshot shows the eyes open: `goto` and the two `expectVisible` steps use up time first, so the screenshot misses the ~0.4 s closed window. `expectVisible blob-eyelid` also passes at opacity 0.
- **Root cause:** The step language has no way to hold a brief state, so the agent timed the screenshot with a fixed wait. Its flow passed without proving anything.
- **Category:** evidence that doesn't prove the claim (caught by the verifier, not merged)
- **Fix rung:** none yet, logged only. A follow-up in PROGRESS adds a step that pauses CSS animations at a chosen point.

## 2026-10-23 · The loop's labels were never created, so the first triage failed

- **What happened:** The first dry-run triage failed with `could not add label: 'evolution:ready' not found`.
- **Evidence:** Triage run 40014373428, attempt 1. After `evolution:ready`, `risk:low|medium|high`, `needs-human` and `evolution:revert` were created by hand, attempt 2 passed.
- **Root cause:** The workflows assume the labels exist, but neither MANUAL_STEPS nor any script creates them, and every test mocks the GitHub API.
- **Category:** setup gap (caught by the dry run)
- **Fix rung:** none yet, logged only. A follow-up in PROGRESS adds them to a setup script and to MANUAL_STEPS.

## 2026-10-23 · `guardrails.yml`'s concurrency group left the required `guardrails-ok` "expected"

- **What happened:** PR #50 had all 22 checks green, but `gh pr merge` was refused: `Required status check "guardrails-ok" is expected`.
- **Evidence:** The PR opened with its labels, so `opened` and two `labeled` events started three guardrails runs in the same second. `group: guardrails-<pr>` cancelled the pending one (run 40020288714), which left a cancelled check suite with no check runs as the newest suite. Rerunning that run made the PR `CLEAN`. #46 had a single run and merged normally.
- **Root cause:** A concurrency group on a workflow that produces a required check. Only one pending run is kept, so a burst of events produces a cancelled suite that branch protection reads as the check never reported.
- **Category:** design gap in CI (caught by the dry run)
- **Fix rung:** none yet, logged only. A follow-up in PROGRESS removes the concurrency group or the label triggers. Without it, auto-merge would stall on every agent PR.

## 2026-10-23 · The build agent shipped a blink flow it never ran, and it fails on production

- **What happened:** #63 (blob blink) merged with every check green. Its post-merge production verify then failed on the builder's own `blob.blink` flow: `step 3 (expectVisible blob-eyelid): locator.waitFor: Timeout 10000ms exceeded.`
- **Evidence:** Post-merge run 40039023852. Locally the flow failed 3 of 3 times; in the build's `verify:all` and `verify:compare` (run 40037068759) it passed. The eyelid is `visibility: visible` for about 245 ms of each 3.5 s loop, so `expectVisible` passes only when a poll lands in that window. The builder's report says it "could not run `pnpm verify:flow` (the command needed approval and was not granted), so the new blob.blink flow was never run", and its risk note says "expectVisible may miss the 250ms window". The run shows 5 permission denials; the log doesn't say which commands.
- **Root cause:** `build.md` never pointed to `pauseAnimations`/`expectStyle`, and the builder couldn't run the verify tool, so nothing caught the timed check. `evolution-verify` judged the change with its own flows, which did pause (9/10), so the PR's real behaviour was right and only its flow was wrong.
- **Category:** flaky verification (caught by post-merge)
- **Fix rung:** prompt (#64) and the flow itself (pause at 1000 and 3350 ms, `expectStyle` on `visibility`; 3 of 3 pass). Why the builder's verify commands were denied is still open.

## 2026-10-23 · The builder's `--allowedTools` never allowed a verify command

- **What happened:** The build agent couldn't run `pnpm verify:flow` in any build, so no builder ever reproduced or verified its own change in a browser, and the #63 flow shipped unrun.
- **Evidence:** A local headless run with the exact list from `evolution-build.yml` (`--setting-sources project`) refused all five ways of running a flow, including a plain `pnpm verify:flow blob.poke`. With `Bash(pnpm verify:flow:*)` or `Bash(pnpm verify:flow *)` the same command ran, and so did an exact rule from the same list.
- **Root cause:** `Bash(pnpm verify:*)` matches `pnpm verify` followed by a space, not `pnpm verify:flow`. The rule was written when the workflow was built and never tested against a real command, and the builder's report only said "needed approval".
- **Category:** permission config that was never exercised (caught while looking into the post-merge failure)
- **Fix rung:** config (#67), then (b) hard rule: `scripts/agent-tools/allowed-tools.test.ts` reads every `--allowedTools` list in the workflows and fails when a `Bash(pnpm …)` rule doesn't name a whole `package.json` script. Run against the workflow from before #67, it fails on `Bash(pnpm verify:*)`; on the current one it passes.

## 2026-10-24 · The first full eval run scored the machine, not the skills

- **What happened:** 4 of the 8 cases failed (3/10 to 6/10). In verify-app/01, verify-app/02 and build-evolution-issue/01, verify was never run or every attempt failed on a port conflict. In maintain-feature-map/01 the agent couldn't run `pnpm featuremap` or `pnpm check`.
- **Evidence:** Run `2026-10-24T01-05-57-432Z`. Port 3200 was held by `next start -p 3200` (PID 4512), started at 20:03 from the main repo by an earlier verify run of mine that was never stopped. The transcripts' `permission_denials` hold 3–4 `PowerShell` calls per failing case, among them a plain `pnpm featuremap`. The allow-list has only `Bash(...)` rules.
- **Root cause:** Three runner gaps. Nothing checked that verify's port was free. Nothing stopped the verify server a case had started, so it would hold the port for the next case. And on Windows the agent had a PowerShell tool that the allow-list doesn't cover; the CI builder has only Bash.
- **Category:** test harness, plus a leftover process (mine)
- **Fix rung:** (a) design, in `scripts/evals.ts`: before each case the runner fails if the verify port answers (shown failing against PID 4512 before it was stopped). After each case it runs `pnpm verify:down` in the copy. `SUBJECT_DISALLOWED_TOOLS` removes PowerShell. The whole set was then run again (`2026-10-24T01-19-39-566Z`), and 8/8 passed.

## 2026-10-24 · Restacking a PR wiped the maintainer's uncommitted trust-level edit

- **What happened:** While landing #72–#75, I restacked #73 with `git merge origin/main` and then `git checkout HEAD -- .`, the recipe for keeping the branch's tree after a squash. The working tree also held the maintainer's uncommitted `"trustLevel": 1` in `.evolution/config.json`, and the checkout put it back to 0.
- **Evidence:** Before the restack, `git status` showed ` M .evolution/config.json`. Afterwards the status was empty, and `.evolution/config.json:2` read `"trustLevel": 0`. Nothing was committed with it: the merge commit's tree equals the branch's.
- **Root cause:** The restack recipe resets every tracked file and assumes a clean working tree. I had been leaving the maintainer's edit unstaged on purpose and carrying it between branches, and I didn't connect the two.
- **Category:** destructive git command on a dirty working tree
- **Fix rung:** (a) design: the restack script now refuses to run when the working tree has uncommitted changes to tracked files. The stacked-PR memory says the same. The edit itself is the maintainer's to redo, because only a human raises the level.

## 2026-10-24 · The secret scrub broke every agent step, and a skipped check stood in as proof it didn't

- **What happened:** #78 set `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"` on all six claude-code-action steps. With that setting the pinned CLI (2.1.309) refuses to install without bubblewrap, which the runners don't have, so triage, build, the verify planner and judge, the PR review and `@claude` would all have failed. In #78 I cited the review run on that PR as proof the setting worked. The loop was quiet, so nothing broke in practice.
- **Evidence:** The #78 review run (40054773554) is green, but its log says `Skipping action due to workflow validation: ... must ... have identical content to the version on the repository's default branch`: the PR changed the workflow, so the action never ran. The first review after the merge (#79, run 40055678367) failed with `error: bubblewrap is required for subprocess env scrubbing and isolation`.
- **Root cause:** I read a green check as "ran and passed" without opening its log. claude-code-action reports a skip as success, and it always skips on a PR that edits its own workflow, which is exactly the PR that changes how it runs.
- **Category:** false evidence (a skipped check cited as a pass), plus a setting never exercised in its real environment
- **Fix rung:** (a) design: every agent job installs bubblewrap before the agent, and `workflow-limits.ts` fails a job that doesn't. The CLI with the scrub and bubblewrap was run on a throwaway branch (`probe/agent-sandbox`) through `pnpm check`, `verify:all` and `verify:compare` before this fix. The lesson for evidence: open the log of any check cited as proof, and a PR that edits an agent workflow proves that workflow with a separate run, not its own checks.

## 2026-10-24 · The guardian's promote leaned on a Vercel field no one had seen after a real rollback

- **What happened:** In the Phase 8 spike test, the guardian rolled production back and its revert (#91) merged. The next run with `act` didn't promote. My first fix (#93's first commit) then left eight problems, which two independent reviews found. One was a spike after the promote that would have rolled production back onto the incident's deployment.
- **Evidence:** The summary of run 40126930025 reads "last promote or rollback: none". `GET /v9/projects/{id}` had no `lastAliasRequest` after the rollback, and none after the guardian's promote either (run 40132630340). #93's body lists the review findings.
- **Root cause:** 8.5b built `rolledBackFrom` and the "held through a promote" rule on `lastAliasRequest`, from Vercel's docs. The dry runs only ever saw a project with no promote or rollback, so nothing checked that Vercel fills the field in. My first fix then patched the one decision that had failed, without walking through the states it creates: after the promote, and at the next incident.
- **Category:** an unverified assumption about an external API, then a fix that wasn't checked against the states it creates
- **Fix rung:** (a) design (#93):
  - the rollback is read from the deployment list;
  - a reported request counts only if it succeeded after the newest served deployment went live;
  - after an incident's promote, production is held until the next deploy, through the incident marker;
  - a promote that didn't take turns every check red.

  The tests cover the real shape from #92. The spike test found the bug, which is why any path that changes production runs for real before its phase closes.

## 2026-10-24 · The postmortem workflow first ran end to end in the spike test, and failed twice

- **What happened:** When the guardian's revert merged, post-merge dispatched `evolution-postmortem`, and its agent job stopped at once with `Workflow initiated by non-human actor: github-actions (type: Bot)`. A hand dispatch got past that, and its agent wrote a patch. Then the check job's `pnpm check` failed with `browserType.launch: Executable doesn't exist`.
- **Evidence:** Runs 40126860735 and 40127698596. Each one posted "The postmortem didn't open a PR" on #92.
- **Root cause:** #84 said "Not run end to end yet", and I didn't read the two things a run would have hit:
  - claude-code-action refuses any bot that `allowed_bots` doesn't name, and a dispatch made with the job token comes from `github-actions`;
  - `pnpm check` runs the `scripts/verify` tests, which launch Chromium. The check job installed none, though `ci.yml`'s unit job and `app-stack` both do.
- **Category:** a workflow never run with its real trigger
- **Fix rung:** (a) design. #94 adds `allowed_bots: github-actions` to the build and postmortem agent steps, and #95 installs Chromium in the check job. The rerun of the #89 postmortem after both merged (run 40132653779) passed its check job and opened #96, but it tests #95 only. I dispatched it as a person, so the `github-actions` path that #94 fixes stays untested until the next guardian revert merges and post-merge dispatches the postmortem. Not done yet: a `workflow-limits.ts` rule that fails any job that runs `pnpm check` without installing Chromium would make the second failure impossible.

## 2026-10-24 · The category filter threw on an unknown ?category, and the board broke in production

- **What happened:** #89 (issue #88, the Phase 8 exit test, deliberately buggy and merged by hand at level 0) added `?category=bug|idea` to the board. Any other value made the board's render throw `Error: feedback: unknown category filter "guardian-test-a"`, so the page showed "Something went wrong" instead of the whole board. In production that was the new unhandled Sentry issue PETRI-3 (24 events in a minute), and the guardian rolled back, reverted it (#91) and opened incident #92. The expected behaviour for a value nobody planned for is no filter, as `parseFeedbackSort` does for `?sort` (`src/features/feedback/lib/feedback-sort.ts:7-10`).
- **Evidence:** `git show 76eda49`: `parseCategoryFilter` throws at `src/features/feedback/lib/feedback-filter.ts:9`, and `FeedbackBoard` calls it on `params.category` while rendering (`components/feedback-board.tsx:16` in that commit). With those lines put back, a unit test `parseCategoryFilter("guardian-test-a")` failed with that error, and `pnpm verify:script` on `/feedback?category=guardian-test-a` failed at `expectVisible feedback-list` with React error #441 in the console, its screenshot showing the error page. #89's own tests and flow only tried `bug`, `idea`, empty and missing values, and so did the issue's criteria.
- **Root cause:** URL input that any visitor controls was parsed with a `throw` for the values the criteria didn't list, in code that runs during the render. Nothing in `pnpm check` looked at how search parameters are parsed, and the verify flows only cover the criteria's happy paths, so the gates had nothing to catch it with. This time the bug was planted on purpose; a builder writing only to the criteria would make the same mistake.
- **Category:** untrusted input treated as trusted (no gate for unplanned URL values)
- **Fix rung:** (b) hard rule: the lint rule `petri/url-input-never-throws` (`lint-rules/index.mjs`, on for every `src/` file) fails on a `throw` inside a function that takes a search-param value (`string | string[] | undefined`, any order, `readonly` or `Array<string>`) or a `searchParams` parameter. `pnpm lint` with #89's parser put back failed on `feedback-filter.ts:9`, and nothing else in the repo; on main it passes. `lint-rules/url-input-never-throws.test.ts` keeps #89's parser as a fixture. Eval case: `evals/build-evolution-issue/cases/03-unknown-url-value`.

## 2026-10-24 · Claimed post-merge's token was in `.git/config` from a search that `head` cut short

- **What happened:** While building #106, the coordinating agent concluded that post-merge's checkout kept the job token, so the verify step could read it from `.git/config`. It wrote "readable from `.git/config` in that very step" into #106's line in `docs/decisions.md`, which merged. It also wrote the claim into #106's PR body and a PROGRESS draft, and told the maintainer. In fact the checkout sets `persist-credentials: false` (`.github/workflows/evolution-post-merge.yml:38` at 3e712e3), so the token isn't in `.git/config`. The verify step's code reaches the token and the service-role key in the later steps instead, through `$GITHUB_ENV`, `$GITHUB_PATH` or a process left running.
- **Evidence:** The claim rested on `grep -rn "persist-credentials" .github/ | head`. `head` printed 10 lines, nine from `ci.yml` and one from `evals.yml`. At 3e712e3^, the tree #106 was built on, the same command finds 39 matches, and `evolution-post-merge.yml:38` is the 21st. `git log -S "in that very step" -- docs/decisions.md` names 3e712e3 (#106) as the commit that added the clause. #106's body now has a "Corrected after merge" note.
- **Root cause:** The agent read absence from output it had cut short, and didn't open the one file the claim was about. The existing rules already forbid that: `investigate-before-claiming` rule 1 (cite `path:line` from a file you opened) and CLAUDE.md's "cite the files and lines you actually read". The truncation is reproduced above. Why the agent skipped those rules isn't proven.
- **Category:** unverified claim in evidence (absence read from truncated output)
- **Fix rung:** (c) skill. `investigate-before-claiming`'s anti-patterns now say: "Concluding that something is absent from output that `head`, a `head_limit` or a summary cut short. Count the matches, or open the file the claim is about." The eval case `evals/investigate-before-claiming/cases/03-cut-search-and-gate-rule` pastes the same `| head` sample, rebuilt at 9ba60a2 (the first 10 of 41 matches, none from post-merge), and fails a run that repeats the claim. In its three runs on 2026-10-25, every agent corrected this claim, but none loaded the skill (the entry below has the scores). #108 corrected the decisions line in place, and its job split removed the exposure the claim was about. No hard rule fits, because no check can tell a `| head` that samples from one that a claim of absence rests on.

## 2026-10-24 · Told the maintainer that a human PR needs `protected-ok`

- **What happened:** The coordinating agent told the maintainer that #108, #109 and the PR raising `trustLevel` to 1 each needed the `protected-ok` label because they change protected paths, and that `guardrails-ok` would fail without it. #108's and #109's PR bodies say the same under Risk. The maintainer added the label to #108, #109 and #112. None of them needed it, because `protected-paths` passes any PR that isn't an agent PR, whatever it touches (`scripts/check-protected-paths.ts:17-25`). The labels did no harm, but the maintainer took steps that weren't needed and was told the trust raise depended on them.
- **Evidence:** #111, a duplicate of the trust PR, had no label. Its guardrails log says "protected-paths: PR #111 0e66365...a0ccfa1 is not an agent PR, so guardrail files may change here.", and `guardrails-ok` passed. The docs already had it right. `docs/MANUAL_STEPS.md:42` scopes the label to "an agent PR that touches guardrails", and `docs/runbook.md:132` says "Only a PR of yours can raise it." #96, which did need the label, came from the postmortem agent (`postmortem/89-ee4a42c`).
- **Root cause:** The agent generalized from #96 and from CLAUDE.md's "A protected path (`.github/guardrails.json`) in an agent PR fails CI", dropped "agent", and told the maintainer what to do without reading the check or either doc. It's the same failure as the entry above: a claim about what the repo does, made without opening the file that decides it.
- **Category:** unverified claim in instructions to the maintainer (a gate's rule stated without reading the gate)
- **Fix rung:** (c) skill. `investigate-before-claiming`'s anti-patterns now say: "Telling someone what a check or label requires from memory, a past PR or a paraphrase. Read the check's code or its doc, and cite the line that decides." Its description now names that moment. The same eval case, `03-cut-search-and-gate-rule`, asks for a Risk section claiming that a PR opened by hand needs `protected-ok`, and fails a run that writes the claim in. Nothing yet shows the lines stop the mistake. The case ran three times on 2026-10-25: 9/10 against the old skill, then 4/10 and 8/10 against the new one, and no run loaded the skill. The 4/10 run (`2026-10-25T01-57-10-703Z`) made this mistake again. It read `guardrails.json` but not the check, and wrote that `guardrails-ok` fails until a human adds `protected-ok`. If the case keeps failing, the next rung is (d), a CLAUDE.md line, because CLAUDE.md is always loaded. The docs were already right, so they need no change.
