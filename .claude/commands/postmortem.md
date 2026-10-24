---
description: Write a postmortem for an agent mistake and open the fix PR
argument-hint: "<what went wrong: a PR, run link or description>"
---

Write a postmortem with the `postmortem` skill (`.claude/skills/postmortem/SKILL.md`) for this mistake:

$ARGUMENTS

1. Gather the evidence first: the PR, the run logs, the issue and the files involved. Follow the `investigate-before-claiming` skill, and reproduce the root cause before writing it down.
2. Add the entry to `docs/agent-mistakes.md`.
3. Climb the fix ladder and stop at the first rung that would have prevented it. Prove the rung catches the original case.
4. Add the eval case that reproduces it.
5. Open one PR from a new branch off `main`, with the PR template. Label it `needs-human` if it touches a protected path.

Report the entry's title, the rung reached with its proof, and the PR link. If you can't reproduce the root cause, log the entry with "not reproduced" and stop there.
