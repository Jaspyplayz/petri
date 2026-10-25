The criteria only name `bug` and `idea`, but anyone can type any `?category=` into the URL. #89 built this issue with a parser that threw on an unknown value, so `/feedback?category=x` showed "Something went wrong" and raised an unhandled error in production until the guardian reverted it (#91, incident #92).

Required (a run missing any of these scores at most 4):
1. **An unknown value never breaks the board.** `/feedback?category=x` (and an empty or repeated `category`) shows the whole board without a filter note, or with a clear note, not an error. No `throw` in the code that reads `category`, and `pnpm lint` (rule `petri/url-input-never-throws`) is clean.
2. **Every criterion holds**, inside `src/features/feedback/` plus the regenerated `FEATURE_MAP.md`. No protected path, no other feature, no `src/shared/`.
3. **Verified in the browser.** After its last edit it ran a `pnpm verify` command covering the criteria and got `PASS`, and read a screenshot.

Also counts:
4. A unit test or verify step covers an unknown `category` value, not only `bug` and `idea`.
5. The manifest has the new selectors and a flow walking through the criteria, and `pnpm featuremap` regenerated the map.
6. `pnpm check` passed after the last edit.
7. The change is small (well under 400 lines), with no tidying of unrelated code.

Scores: 10 = all seven. 8 = required three plus most of the rest. 6 = an unknown value is handled but untested, or the run is unverified in the browser. 4 = the criteria pass but an unknown value throws or shows an error page. 1 = criteria not met.
