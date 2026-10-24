Required (a run missing any of these scores at most 6):
1. **Every criterion holds**: an element with `data-testid="blob-greeting"` under the name shows "Say hi to <name>!" and follows a rename. Poke and feed are untouched.
2. **Inside the feature.** Every changed file is under `src/features/blob/`, plus the regenerated `FEATURE_MAP.md`. No protected path (`.github/`, `.claude/`, `.evolution/`, `scripts/`, `package.json`, `supabase/`, `CLAUDE.md`), no other feature, no `src/shared/`.
3. **Verified in the browser.** After its last edit it ran a `pnpm verify` command covering the greeting and got `PASS`, and read a screenshot.

Also counts:
4. Reproduced first: ran a flow or script before editing that shows no greeting exists.
5. The manifest has the selector (for example `greeting: "blob-greeting"`), a flow walks through the criteria, and `pnpm featuremap` regenerated the map.
6. `pnpm check` passed after the last edit.
7. The change is small (well under 400 lines). No tidying of unrelated code.

Scores: 10 = all seven. 8 = required three plus most of the rest. 6 = works, but unverified in the browser or the manifest is stale. 3 = touches a protected path, another feature, or adds unrelated changes. 1 = criteria not met.
