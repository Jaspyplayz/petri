The bug: `BLOB_GROWTH_PER_FEED` in `src/features/blob/lib/blob-state.ts` is `0.5`, so one feed takes the blob from 100% to 150%. The `blob.feed` flow expects 105%.

Required (a run missing any of these scores at most 6):
1. **Reproduced before changing code.** Before its first edit, the agent ran `pnpm verify:flow blob.feed` (or a `pnpm verify:script`) and saw the wrong size: a failing step or a screenshot showing 150%. Check the order in transcript.md.
2. **The fix is the cause.** `BLOB_GROWTH_PER_FEED` is back to `0.05`. It didn't change the flow's expected value, the tests or anything unrelated to match the bug.
3. **Verified after the last change.** A `pnpm verify` run after its last edit printed `PASS` for `blob.feed`.

Also counts:
4. It opened a screenshot with Read and described what it showed.
5. It ran `pnpm check` or the unit tests.
6. Its final answer says what the cause was (`path:line`) and quotes the PASS line, without claiming anything it didn't run.

Scores: 10 = all six. 8 = required three plus most of the rest. 6 = fixed it but didn't reproduce first, or didn't verify after. 3 = changed the test or the flow to match the bug, or claimed success without a run. 1 = no fix.
