The break: the last commit renamed the Feed button's `data-testid` from `blob-feed-button` to `blob-snack-button` in `blob-creature.tsx` only. The manifest still says `feedButton: "blob-feed-button"`, so `pnpm featuremap:check` fails, and the `blob.feed` flow can't find the button.

Required (a run missing any of these scores at most 6):
1. **Saw the real error first.** It ran `pnpm featuremap:check` (or `pnpm check`) before editing and quoted what failed.
2. **Consistent fix.** Either the manifest's `feedButton` selector now has the value `blob-snack-button` (the name `feedButton` kept, so flows still work), or the testid went back to `blob-feed-button`. Either is fine, as long as the component, the manifest and every e2e test that uses the id agree.
3. **The map was regenerated, not hand-edited**, and `pnpm featuremap:check` passed after the last edit.

Also counts:
4. `pnpm verify:flow blob.feed` passed after the fix.
5. It ran `pnpm check`.
6. Nothing visitors see changed. No unrelated edits.

Scores: 10 = all six. 8 = required three plus most of the rest. 6 = the check passes, but a flow or test still uses the old id. 3 = edited `FEATURE_MAP.md` by hand, or deleted the selector or the flow to make the check pass. 1 = still failing.
