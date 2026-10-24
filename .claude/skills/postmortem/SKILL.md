---
name: postmortem
description: Use after an agent mistake is caught - a verify fails, CI fails on an agent PR, a PR is reverted, the verifier finds scope creep, or a human corrects an agent - or when asked for a postmortem. Logs it in docs/agent-mistakes.md, climbs the fix ladder (design → hard rule → skill → CLAUDE.md), adds an eval case, and opens the fix PR.
---

# postmortem

Every agent mistake should make the next one less likely. A mistake that's only logged repeats; one that becomes a rule can't. So each postmortem ends in a change, as high up the ladder as it can go.

## 1. Log it

Add an entry to the end of `docs/agent-mistakes.md`, in the existing format:

```markdown
## YYYY-MM-DD · <what went wrong, in one line>

- **What happened:** what was observed vs expected, with the exact error text.
- **Evidence:** run links or ids, PR numbers, `path:line`. Things a reader can open.
- **Root cause:** why it happened, proven by a run (the `investigate-before-claiming` skill). If it isn't proven yet, say so.
- **Category:** a short tag, for example "flaky verification", "permission config", "design gap in CI".
- **Fix rung:** the rung reached (below) and the PR.
```

Cite what you read. Don't write a root cause you haven't reproduced.

## 2. Climb the ladder, and stop at the first rung that works

| Rung | What it is | Example from this repo |
|---|---|---|
| **a. Design** | Change the generator, architecture or workflow so the mistake can't happen. | The Tailwind loader scoped to `globals.css`, so CSS Modules can't be emptied again. |
| **b. Hard rule** | A lint rule, CI check or unit test that fails on the mistake, with a test showing it catches the original case. | `scripts/agent-tools/allowed-tools.test.ts` fails on `Bash(pnpm verify:*)`, the rule that left the #63 builder unable to verify. |
| **c. Skill** | Add to or sharpen a skill (the `write-skill` skill). | `build-evolution-issue`: run a new flow twice, pause brief animations. |
| **d. CLAUDE.md line** | Last resort, for a rule that fits nowhere else. | |

A rung "works" when it would have stopped the original mistake. Show it: for a hard rule, run it against the old code and see it fail (put the old file back for one run, then restore it).

## 3. Add an eval case

Every entry adds a case under `evals/<skill>/cases/NN-<name>/` that reproduces the original situation, for the skill that should have prevented it: `task.md` (the task as the agent got it), `setup.sh` (puts the repo in that state) and `rubric.md` (what a good run does, scored 1–10). Run it with `pnpm evals <skill>`.

## 4. Open the PR

One PR: the entry, the fix and the eval case. Title `fix(<area>): …` or `docs(postmortem): …`. In the body, quote the evidence and show the rung's proof (the failing run before, the passing run after).

A fix that touches a protected path (`.github/guardrails.json`: `.claude/`, `.github/`, `.evolution/`, `scripts/`, `CLAUDE.md`, …) can't merge from an agent PR. Label it `needs-human` and say so in the body.

## Anti-patterns

- Stopping at the log entry ("logged only") when a rule was within reach.
- Jumping to a skill or a CLAUDE.md line because a lint rule takes longer to write.
- A root cause that's the likeliest story instead of a reproduced one.
- A hard rule with no test against the original case. It might not catch it.
