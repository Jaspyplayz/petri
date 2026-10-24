import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import { postmortemPathProblem } from "./postmortem-paths";

const config = loadGuardrailsConfig(repoRoot);

describe("postmortemPathProblem", () => {
  it.each([
    ["add", ".claude/skills/new-skill/SKILL.md"],
    ["add", "evals/verify-app/cases/09-blank-page/rubric.md"],
    ["add", "lint-rules/no-server-env.mjs"],
    ["add", "scripts/agent-tools/no-blank-page.test.ts"],
    ["add", "scripts/check-features/manifest-flows.test.ts"],
    ["modify", ".claude/skills/postmortem/SKILL.md"],
    ["modify", "CLAUDE.md"],
    ["modify", "eslint.config.mjs"],
    ["modify", "lint-rules/index.mjs"],
  ] as const)("lets a postmortem %s %s", (change, path) => {
    expect(postmortemPathProblem(path, change, config)).toBeUndefined();
  });

  it.each([
    ["delete", ".claude/skills/postmortem/SKILL.md", "can't delete"],
    ["delete", "evals/verify-app/cases/01-x/rubric.md", "can't delete"],
    ["modify", "evals/verify-app/cases/01-x/rubric.md", "add files here but not change"],
    ["modify", "scripts/agent-tools/workflow-limits.ts", "add files here but not change"],
    ["modify", "lint-rules/lint-config.test.ts", "add files here but not change"],
    ["add", ".claude/skills/x/helper.sh", "can't write this protected path"],
    ["add", ".claude/agents/x.md", "can't write this protected path"],
    ["modify", ".claude/commands/run-evals.md", "can't write this protected path"],
    ["modify", "scripts/verify/run.ts", "can't write this protected path"],
    ["modify", "scripts/check-pr/config.ts", "can't write this protected path"],
    ["add", "evals/x/cases/y/.env", "dotfile"],
    ["add", "evals/x/cases/y/.gitattributes", "dotfile"],
    ["add", "lint-rules/.git/hooks/pre-commit", "dotfile"],
    ["add", "scripts/agent-tools/.claude/settings.json", "dotfile"],
    ["add", "evals/x/cases/y/CLAUDE.md", "only the root CLAUDE.md"],
    ["add", "lint-rules/AGENTS.md", "only the root CLAUDE.md"],
    ["add", "evals/x/cases/y/a`b.md", "use only letters"],
    ["add", "evals/x/cases/y/a b.md", "use only letters"],
    ["add", "evals/x/cases/y/a\nb.md", "use only letters"],
  ] as const)("refuses to %s %s", (change, path, reason) => {
    expect(postmortemPathProblem(path, change, config)).toContain(reason);
  });

  it("matches case-insensitively when asked, for a Windows checkout", () => {
    expect(postmortemPathProblem("ESLINT.config.mjs", "modify", config)).toContain("can't write");
    expect(postmortemPathProblem("ESLINT.config.mjs", "modify", config, { ignoreCase: true })).toBeUndefined();
    expect(postmortemPathProblem("lint-rules/claude.md", "add", config, { ignoreCase: true })).toContain("only the root CLAUDE.md");
  });
});
