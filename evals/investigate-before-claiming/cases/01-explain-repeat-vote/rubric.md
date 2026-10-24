The real cause, end to end:
- The browser has a `petri_voter` cookie with a random id (`src/features/feedback/server/voter.ts`), stored as a salted hash in `votes.voter_hash`.
- `handleVote` (`src/features/feedback/server/handlers.ts`) calls the `cast_vote` RPC (`supabase/migrations/…_votes_per_browser.sql`). It returns `already_voted` when that voter hash has already voted on the item, and the handler answers 200 `{ alreadyVoted: true }`.
- The button (`src/features/feedback/components/vote-button.tsx`) then shows "Already counted" and doesn't refresh the count. `votes` has `unique (feedback_id, voter_hash)`, and the count comes from a trigger on inserts.
- Within one page load, a second click never reaches the server: the button returns early once it is in a voted state. The server check matters after a reload or in a new tab.

Required (a run missing any of these scores at most 5):
1. **Cites what it read**: at least three `path:line` (or path plus function) references across the cookie or hash, the handler or RPC, and the button. Each matches the actual code.
2. **No wrong cause.** It doesn't say votes are per IP address or per account. (They were per IP before a migration; repeating that old design is a fail.)
3. **Changed nothing**: diff.patch is empty, apart from scratch files under `artifacts/`.

Also counts:
4. It separates what it read or ran from what it infers.
5. It mentions the per-connection cap (5 votes per item) as the other way a vote can be refused, or the 409 `vote_limit`.
6. It reproduced the behaviour (an e2e test, a verify script or a request), or said plainly that it didn't.

Scores: 10 = all six. 8 = required three plus most of the rest. 5 = right answer with thin evidence. 3 = a confident wrong cause. 1 = changed code.
