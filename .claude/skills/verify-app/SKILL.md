---
name: verify-app
description: Use whenever you change UI or behaviour, reproduce a bug, or claim something works. Builds and drives the real app (Next.js plus local Supabase) in headless Chromium with pnpm verify:flow, verify:script, verify:all and verify:compare, and produces the screenshots and pass/fail report you read, describe and attach to the PR.
---

# verify-app

A change is verified only when a `pnpm verify:*` run started after your last code change prints `PASS`. Passing unit tests, a clean build or "it should work" don't count.

## Protocol

Do this for every change to UI or behaviour and for every bug, in this order.

1. **Reproduce first.** Before changing any code, show the bug or the missing feature in a screenshot.
   - If a flow covers it, run `pnpm verify:flow <feature>.<flow>`. Flows and selector names are in `src/features/<id>/feature.manifest.ts`.
   - Otherwise write a script for the behaviour you want and run `pnpm verify:script <file.json>`. Before the fix it fails at the step that shows the problem, and that step still gets a screenshot.
   - Open that screenshot with the Read tool and describe what it shows. If you can't reproduce the problem, say so and stop. Don't fix what you haven't seen.
2. **Change the code.** Make the smallest change that fixes it.
3. **Re-run** the same flow or script until it passes, then run the smoke test, `pnpm verify:all`. Both must print `PASS`.
4. **Look at the screenshots yourself.** Read the screenshot for each step that matters and describe what is on screen: text, state, colours, layout. Describe what you see, not what you expect. A passing report whose screenshot shows the wrong thing is a failure.
5. **Show the change visually.** For anything visible, run `pnpm verify:compare origin/main <feature>.<flow>` and read the side-by-side images.
6. **Attach the report to the PR.** The PR body's verification section gets:
   - the `PASS` lines the CLI printed, with the run folder
   - `summary.md` from `verify:all`, and the `compare.md` table for visible changes
   - one or two sentences describing each of the reproduction screenshot and the after screenshot. `gh` can't upload images, so reviewers read your description.
7. **Never claim success without a passing report.** "Fixed", "works" and "done" each need a `PASS` from a run after your last change. If you didn't run it, say it isn't verified.
8. **Stop after three failures.** If verification still fails after three attempts at the same task, stop changing code and report on the issue:
   - Comment with what you tried, each failure line, the report paths, and what the screenshots show: `gh issue comment <n> --body-file <file>`.
   - Then label it: `gh issue edit <n> --add-label evolution:stuck`.

Never make a run pass by weakening it. Don't remove steps or assertions from a flow, edit the fail rules, or point `--base-url` at a stale server. `scripts/**` is a protected path.

## Commands

| Command | What it does |
|---|---|
| `pnpm verify:up` | Starts local Supabase if it isn't running (Docker), builds the app and serves it at `http://127.0.0.1:3200` (`VERIFY_PORT`), then prints the URL. It reuses its own server while the build inputs and `.next` are unchanged, and rebuilds otherwise (about 6 s). |
| `pnpm verify:down` | Stops the server that `verify:up` started. |
| `pnpm verify:flow <feature>.<flow>` | Runs one flow from a manifest. An unknown name lists every flow. |
| `pnpm verify:script <file.json>` | Runs ad-hoc steps. A relative path is resolved from where you ran pnpm. |
| `pnpm verify:all` | Runs every flow in every manifest and writes `summary.md` and `summary.json`. CI's e2e job runs it too. |
| `pnpm verify:compare <baseRef> [flow ...]` | Builds `baseRef` in a git worktree, serves it on `VERIFY_PORT + 1`, and runs the flows (all of them by default) on it and on this working tree. Only a flow that fails after the change makes it fail. |

`flow`, `script` and `all` start or reuse the app themselves. `--base-url <url>` checks an app that's already running instead; `compare` doesn't take it. Exit codes: 0 pass, 1 verification failed, 2 usage or setup error (the message says what to fix).

## Scripts

A script is a JSON list of steps, or `{ "description": "…", "steps": [ … ] }`. Targets are `data-testid` values; flows in manifests use selector names instead. Each step has 10 s to succeed, and a failing step ends the run.

```json
{
  "description": "A blank name shows an error, then Enter saves the new name",
  "steps": [
    { "action": "goto", "path": "/" },
    { "action": "fill", "target": "blob-name-input", "value": "  " },
    { "action": "click", "target": "blob-name-save" },
    { "action": "expectVisible", "target": "blob-name-error" },
    { "action": "fill", "target": "blob-name-input", "value": "Wobbles" },
    { "action": "press", "target": "blob-name-input", "key": "Enter" },
    { "action": "expectText", "target": "blob-name", "text": "Wobbles" }
  ]
}
```

| Step | Fields | Notes |
|---|---|---|
| `goto` | `path` | Must start with `/`. Waits for the load event. |
| `click`, `expectVisible` | `target` | Act on the first element with that testid. |
| `fill` | `target`, `value` | Replaces the field's text. |
| `press` | `target`, `key` | Playwright key names: `Enter`, `Escape`, `ArrowDown` and so on. |
| `expectText` | `target`, `text` | Waits for an element with that testid whose text contains `text`. |
| `expectStyle` | `target`, `property`, `value` | Waits until the element's computed `property` (kebab-case) equals `value` exactly, as the browser reports it: `"1"` for opacity, `"rgb(47, 143, 107)"` for a colour. |
| `pauseAnimations` | `atMs` | Pauses every running CSS animation and transition at `atMs` into its timeline. Use it for brief states, such as a blink at 94–97% of a 5 s loop: `pauseAnimations` 4750, then `expectStyle`, then `screenshot`. Don't time a `wait` for it. |
| `screenshot` | `name` | Labels the step. Every step is screenshotted anyway. |
| `wait` | `ms` | At most 30000. Prefer `expectVisible` or `expectText`. |

Find testids in the feature's manifest `selectors`, or with `grep -rn data-testid src/features/<id>`. Keep throwaway scripts out of the repo, for example in your scratchpad.

## Reading a run

Each run writes `artifacts/verify/<timestamp>/<name>/` containing:
- `report.md`: the failures; a table of steps with timings and screenshots; console errors and warnings; network problems; axe violations per element with axe's reason; and LCP and CLS per page
- `report.json`: the same data
- `step-NN.png`: a 1280×720 viewport screenshot after each step. The checks cover the whole page, but the screenshot shows only what's in view.

`verify:compare` writes:
- `base/<flow>/` and `pr/<flow>/`
- `compare/<flow>/step-NN.png`, with before on the left and after on the right
- `compare.md` and `compare.json`

A run fails on any of these, one line each:

| Failure line | Meaning |
|---|---|
| `step 4 (click blob-poke-button): no element with data-testid="blob-poke-button" on the page` | The testid isn't rendered. Check the manifest and the component. |
| `step 5 (expectText blob-pokes "1"): expected data-testid="blob-pokes" to contain "1"; it shows "0"` | The page shows something else. Read that step's screenshot. |
| `console.error: …` / `pageerror: …` | Any console error or uncaught exception, from any step. |
| `HTTP 500 POST http://…` / `request failed (net::…) GET …` | A response of 400 or more, or a request that failed. Cancelled navigations (`net::ERR_ABORTED`) are allowed. |
| `a11y serious: color-contrast (…) on <elements>. <reason>` | A serious or critical axe violation. Moderate and minor ones are only listed in the report. |
| `class name contains "undefined" or "null": …` | A class string was built from a missing value. |

## Things that catch people out

- **Screenshots use `caret: "initial"`.** Playwright's default `caret: "hide"` writes an inline style before React hydrates, and React logs a hydration error the app doesn't have (`docs/agent-mistakes.md`). Any new screenshot code in `scripts/verify/` must spread `screenshotOptions`, and a test checks that.
- **HTTP statuses come from Playwright's response events.** A browser extension's network panel has reported 503s that never happened.
- **Flows that write add real rows.** `feedback.post` and `feedback.vote` write to the local database on every run, and both sides of `verify:compare` share it. Don't run them with `--base-url` against production.
- **Previews answer `/api/events` with 503 by design,** so `--base-url <preview>` fails until Phase 6 handles that.
- **Windows:** when a run exits non-zero, pnpm also ends the server that run started. The next run starts it again.
- **The local rate limit** doesn't trip on repeat runs, because each run sends a random `x-forwarded-for`.

## Interactive debugging (optional)

For traces, performance profiles or poking at the DOM, start the app with `pnpm verify:up` and connect a browser MCP server to the printed URL:
- Playwright MCP: `claude mcp add playwright npx @playwright/mcp@latest`
- Chrome DevTools MCP: `claude mcp add chrome-devtools npx chrome-devtools-mcp@latest`

Pin a version you've checked before relying on either one. They help you find a cause, but they aren't evidence: only a `verify:*` report counts, because it runs the same way in CI.
