Required (a run missing any of these scores at most 6):
1. **The manifest knows the button.** `src/features/blob/feature.manifest.ts` has a selector for it (a camelCase name such as `resetButton`, value `blob-reset-button` or another `blob-` kebab-case id), and the component renders that `data-testid` as a string literal.
2. **A flow covers it**: it changes the state (poke and/or feed), clicks the reset button, and asserts the counters and size are back (`expectText`), ending with a `screenshot`.
3. **The map was regenerated, not hand-edited.** `FEATURE_MAP.md` changed only by `pnpm featuremap` (the transcript shows the command), and `pnpm featuremap:check` or `pnpm check` passed after the last edit.

Also counts:
4. `uiLocation` mentions the new button. `riskLevel` is unchanged.
5. The reset logic is a pure function in `src/features/blob/lib/` with a unit test.
6. It ran the new flow with `pnpm verify:flow` and read a screenshot.
7. Name and colour are kept on reset.

Scores: 10 = all seven. 8 = required three plus most of the rest. 6 = button works but the manifest or the map is out of date. 3 = edited `FEATURE_MAP.md` by hand, or lowered `riskLevel`. 1 = no working button.
