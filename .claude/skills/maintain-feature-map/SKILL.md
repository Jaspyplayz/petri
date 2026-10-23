---
name: maintain-feature-map
description: Use whenever you add, rename, move or remove UI or a data-testid, add a feature, route or behaviour, when pnpm featuremap:check fails, or when asked to audit FEATURE_MAP.md. Keeps each feature.manifest.ts (selectors, flows, uiLocation, howToReach) true to the app and regenerates FEATURE_MAP.md from it.
---

# maintain-feature-map

`FEATURE_MAP.md` is how agents find things: vague feedback ("the thing on the right is broken ???", or a screenshot) gets mapped to a feature folder and a flow through it. It's generated from `src/features/<id>/feature.manifest.ts`, so the manifests have to stay true to the app.

**Never edit `FEATURE_MAP.md` by hand.** Change the manifest, run `pnpm featuremap`, and commit both files in the same commit as the UI change.

CI's `featuremap` job (`pnpm featuremap:check`) fails when:
- the map is stale
- a `data-testid` in a feature's code isn't a selector in its manifest
- a selector isn't rendered anywhere in its feature
- a template testid matches no selector
- a testid can't be read statically

## When the UI changes

Update the manifest in the same change.

| You changed | Update in the manifest |
|---|---|
| Added, renamed or removed a `data-testid` | `selectors`. Keep the selector **name** (camelCase, what it is) and change only the value. Flows refer to names, so they keep working. |
| Moved something or changed what's on screen | `uiLocation`: plain English, relative to landmarks a person can see ("under the top navigation", "on the right of the board"). |
| How you get there | `howToReach`: numbered steps from `/`, one action each. Put alternatives in the same step, in brackets. |
| A new page | `routes` |
| A new table | `dataTables` |
| A shortcut | `keyboardShortcuts` |
| New user-visible behaviour | a flow (below) |

Rules for testids:
- Name them `<feature>-<thing>` in kebab case, for example `feedback-vote-button`.
- Write them as a string literal, or as a template with a fixed prefix (`` `feedback-sort-${sort}` ``). The check can't read `data-testid={ids.title}` and fails on it.
- A template covers every selector it matches. When you add a value behind a template, such as a new sort, add its selector yourself; the check can't tell it's missing.

**Never lower `riskLevel`.** The trust ladder decides what may auto-merge from it, so lowering it would raise your own permissions. Raising it is fine. Leave a lowering to a human.

Then run:

```
pnpm featuremap          # regenerates FEATURE_MAP.md
pnpm featuremap:check    # must print "featuremap: ok"
```

## Adding a flow for new behaviour

Every user-visible behaviour gets a flow, so `pnpm verify:flow <feature>.<flow>` and `pnpm verify:all` cover it. A flow:
1. Starts with `goto`, using the route, plus a query string if the page needs one.
2. Checks the starting state (`expectVisible` or `expectText`).
3. Does the action (`click`, `fill`, `press`).
4. Asserts the result with `expectText`, `expectVisible` or `expectStyle`. A screenshot alone isn't an assertion. `expectVisible` passes at opacity 0, so assert a fade or blink with `expectStyle`, after `pauseAnimations` holds it in place (the `verify-app` skill's step table).
5. Ends with a `screenshot` named after the state it shows.

Targets are selector names from the same manifest; the types reject anything else. A flow that writes, like `feedback.post`, adds a row on every run, so assert on the text you wrote rather than on counts. Run the new flow with the `verify-app` skill, and read its screenshots, before you call it done.

## Auditing the map

The map is only useful if someone who has only the map can find things. To audit it:

1. Start the app with `pnpm verify:up` and note the URL.
2. Spawn one subagent (general-purpose) with the prompt below. It gets only the map and the URL, not the source. Until it reports, don't check out another branch or edit app code in this working tree. Verify rebuilds from whatever is checked out, so the audit would test that instead. Do side work in a separate `git worktree`.
3. Fix each gap it reports:
   - If the map is wrong, update the manifest and regenerate.
   - If the app is wrong (a step should work and doesn't), it's a bug: reproduce it with the `verify-app` skill, and fix it or file it.

Prompt for the subagent:

> You are auditing `FEATURE_MAP.md` in this repo. Read only that file. Don't read anything under `src/`, and don't use the manifests. The app is running at `<URL>`.
>
> For each feature, try to reach it using only "How to reach it" and "Where it is on screen".
> - Write one `pnpm verify:script <file.json>` per feature in your scratchpad. Use `goto` for routes, and `expectVisible` for the `data-testid`s the map lists for that feature.
>   - Steps are JSON objects such as `{"action":"goto","path":"/x"}`, `{"action":"expectVisible","target":"<data-testid>"}`, `{"action":"click","target":"<data-testid>"}` and `{"action":"screenshot","name":"x"}`.
>   - A failing step ends that script, so check the selectors that should always be visible first.
> - Some selectors only exist in some states: an empty list, an error, a confirmation, a link only some items have. If one of those isn't visible on a plain page load, report it as state-dependent, not as a map error.
> - Read every screenshot with the Read tool.
> - Check that each landmark the map describes is where it says, such as a link in the top navigation, a form above a list, or a button's label.
>
> Report one line per problem: the feature, the step or sentence from the map (quoted), what you saw instead, and the screenshot path. Then give the features that matched completely. Don't change any files.

If the Playwright MCP is configured, the subagent may use it for steps that name visible text instead of a testid ("click 'Feedback' in the top navigation"). Otherwise it checks those steps in the screenshots.
