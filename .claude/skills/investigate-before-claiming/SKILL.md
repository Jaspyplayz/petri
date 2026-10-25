---
name: investigate-before-claiming
description: Use before you name a root cause, say where something lives, say a change "works" or "is fixed", tell someone what a check or label requires, or answer "why does X happen". Also use when you catch yourself guessing a file, function, flag or behaviour you haven't read. Read the code, cite path:line, search with subagents, and reproduce before claiming.
---

# investigate-before-claiming

A confident guess costs more than a slow answer: someone acts on it. In this repo agents act on each other's claims, so one wrong "the cause is X" turns into a wrong PR, a wrong verdict and a wrong lesson. Claim only what you've read or run.

## The rules

1. **Cite what you read.** Every claim about the code names `path:line` from a file you opened in this session. "The vote handler hashes the IP (`src/features/feedback/server/handlers.ts:73`)", not "votes are probably per IP".
2. **Search, don't guess where things live.** Start from `FEATURE_MAP.md`, then `Grep`. When the answer means sweeping many files or naming conventions, spawn a subagent (`code-searcher`) and keep only its conclusion.
3. **Reproduce before you explain.** "I found it" needs a run: a `pnpm verify:flow`, a `pnpm verify:script`, a unit test or a command whose output shows the bug. Then the same run passes after the fix (the `verify-app` skill).
4. **Separate what you saw from what you think.** Write "Observed: … / Likely because: …". A hypothesis stays labelled as one until a run confirms it.
5. **Say "I don't know" or "I couldn't reproduce it".** Put it in the issue or PR. Never ship a guess to make the answer look finished.
6. **Logs that don't say, don't say.** If a log hides what you need (which command was refused, which request failed), don't infer it. Find a way to see it: run the same thing locally, add output, or ask.

## How to investigate

1. Restate the question as something checkable: "Why does the count not change?" becomes "What does `POST /api/feedback/:id/vote` return for a second browser on the same network?"
2. Find the code path with `FEATURE_MAP.md` and `Grep`, and read it end to end: route, handler, database call, UI.
3. Check the data or the runtime when the code allows more than one answer: the database row, the CI log, the response headers.
4. Form one hypothesis, then design the run that would prove it wrong. Run it.
5. Report with the evidence first, then the conclusion.

## Examples

**Good** (from the #63 builder permissions bug):
> The builder's report says "the command needed approval". Its log shows 5 permission denials but not which commands. A local headless run with the exact `--allowedTools` refused even `pnpm verify:flow blob.poke`; with `Bash(pnpm verify:flow:*)` the same command ran. So `Bash(pnpm verify:*)` doesn't match `pnpm verify:flow`.

**Bad:**
> The builder probably piped its output through `tail`, which isn't allowed. Let's tell it not to pipe.

The bad version would have shipped a prompt change and left the real bug in place.

## Anti-patterns

- Naming a cause from a function's name without reading its body.
- "Should work", "this fixes it" or "tests pass" without a run after the last change.
- Quoting a memory, an old PR or a summary as if it were the current code. Check that the file, function or flag still exists.
- Explaining a flaky result by its likeliest cause. Count runs: "failed 3 of 3 locally" is evidence, "it's flaky" isn't.
- Letting a confirmed hypothesis grow: proving one cause doesn't prove the neighbouring ones.
- Concluding that something is absent from output that `head`, a `head_limit` or a summary cut short. Count the matches, or open the file the claim is about.
- Telling someone what a check or label requires from memory, a past PR or a paraphrase. Read the check's code or its doc, and cite the line that decides.
