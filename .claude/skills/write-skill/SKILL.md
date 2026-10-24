---
name: write-skill
description: Use when creating a skill in .claude/skills/, editing a SKILL.md, turning a postmortem into a skill, or when a skill doesn't trigger or isn't followed. Covers the trigger description, steps, examples, anti-patterns, the size limit, and checking a skill with its evals.
---

# write-skill

A skill is a folder `.claude/skills/<name>/` with a `SKILL.md`. Agents see only its `name` and `description` until the skill is loaded, so the description decides whether it's ever used, and the body decides whether it's followed.

Skills are the third rung of the postmortem ladder (the `postmortem` skill): design → hard rule → **skill** → CLAUDE.md line. Write one only when a lint rule or a check can't catch the mistake.

## The shape

```markdown
---
name: kebab-case-name
description: Use when <the situations, in the words an agent would think them>. <What it does, in one sentence.>
---

# kebab-case-name

<Why it matters here: one short paragraph.>

## Steps (or Rules)
1. …

## Examples
**Good:** …
**Bad:** …

## Anti-patterns
- …
```

## The description

- **Start with "Use when"** and list the triggers: the task ("when building an evolution issue"), the words a request uses ("triage", "postmortem"), and the moment ("before you name a root cause"). An agent matches on these.
- Name the commands, files or labels the skill is about (`pnpm verify:flow`, `evo/*`, `FEATURE_MAP.md`). Concrete words match better than abstract ones.
- One or two sentences. No marketing ("powerful", "comprehensive").

## The body

- **Under about 200 lines.** A long skill gets skimmed. Link to the source of truth (a prompt, a README, a script) instead of copying it, so the two can't drift.
- **Steps are commands or checks**, in the order they're done: `pnpm check`, not "make sure the code is good".
- **Say why** for any rule that looks arbitrary. An agent that knows why can handle the case the rule didn't foresee.
- **Examples from this repo.** A real PR, run or file beats a made-up one. Show a bad example next to the good one.
- **Anti-patterns** are the mistakes the skill exists to stop, ideally each from an entry in `docs/agent-mistakes.md`.
- Plain words. Write for an agent that's smart but has never seen this repo.

## Check it

1. Every file, command, flag and selector it names exists. Run the commands.
2. It doesn't contradict CLAUDE.md, a prompt in `.evolution/prompts/` or another skill. If it does, fix the source, not the skill.
3. Add or update its eval cases in `evals/<skill>/cases/` and run `pnpm evals <skill>`. Keep a change only if the average score doesn't drop and no case gets worse.

`.claude/` is a protected path, so a skill change is a human PR.

## Anti-patterns

- A description that says what the skill is ("Guide to verification") instead of when to use it.
- Restating CLAUDE.md, or a whole prompt, inside a skill.
- A skill for a mistake a lint rule could catch. Rules don't get skimmed.
- Instructions with no reason ("never use wait"), which get dropped the first time they're inconvenient.
