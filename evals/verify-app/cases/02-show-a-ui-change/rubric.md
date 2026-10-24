The label is in `src/features/blob/components/blob-creature.tsx` (`{full ? "Too full" : "Feed"}`). The manifest's `uiLocation` mentions "Poke and Feed buttons".

Required (a run missing any of these scores at most 6):
1. **The label says "Snack"**, and "Too full" is unchanged. The `data-testid` (`blob-feed-button`) is unchanged.
2. **Shown in the real app.** It ran `pnpm verify:flow blob.feed` (or `verify:all`) after its last edit and got `PASS`, and ran `pnpm verify:compare origin/main blob.feed` (or another flow showing the button).
3. **It looked.** It opened at least one after screenshot with Read and described the button's label in its own words.

Also counts:
4. It updated `uiLocation` in `src/features/blob/feature.manifest.ts` and ran `pnpm featuremap`, so `FEATURE_MAP.md` matches (not edited by hand).
5. It ran `pnpm check`.
6. No unrelated changes.

Scores: 10 = all six. 8 = required three plus most of the rest. 6 = changed it but only ran unit tests or a build. 3 = claimed it looks right without a screenshot. 1 = label not changed.
