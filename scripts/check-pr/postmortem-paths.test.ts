import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import { postmortemPathProblem } from "./postmortem-paths";
import { isProtectedPath } from "./protected-paths";

const config = loadGuardrailsConfig(repoRoot);
const at = (path: string, existing?: readonly string[]) => ({ protectedPath: isProtectedPath(path, config), ...(existing === undefined ? {} : { existing }) });

describe("postmortemPathProblem", () => {
  it.each([
    ["add", ".claude/skills/new-skill/SKILL.md"],
    ["add", "evals/verify-app/cases/09-blank-page/rubric.md"],
    ["add", "evals/verify-app/cases/09-blank-page/setup.sh"],
    ["add", "lint-rules/no-server-env.mjs"],
    ["add", "lint-rules/no-server-env.test.ts"],
    ["add", "scripts/agent-tools/no-blank-page.test.ts"],
    ["add", "scripts/check-features/manifest-flows.test.ts"],
    ["modify", ".claude/skills/postmortem/SKILL.md"],
    ["modify", "CLAUDE.md"],
    ["modify", "eslint.config.mjs"],
    ["modify", "lint-rules/index.mjs"],
    ["add", "src/features/blob/tests/blank-page.test.ts"],
    ["modify", "docs/agent-mistakes.md"],
    ["delete", "src/features/blob/lib/old.ts"],
  ] as const)("lets a postmortem %s %s", (change, path) => {
    expect(postmortemPathProblem(path, change, config, at(path))).toBeUndefined();
  });

  it.each([
    ["delete", ".claude/skills/postmortem/SKILL.md", "can't delete"],
    ["delete", "evals/verify-app/cases/01-x/rubric.md", "can't delete"],
    ["modify", "evals/verify-app/cases/01-x/rubric.md", "add files here but not change"],
    ["modify", "scripts/agent-tools/workflow-limits.test.ts", "add files here but not change"],
    ["modify", "lint-rules/lint-config.test.ts", "add files here but not change"],
    ["add", "scripts/agent-tools/public-env.js", "can't write this protected path"],
    ["add", "scripts/agent-tools/helper.ts", "can't write this protected path"],
    ["add", "evals/verify-app/cases/09-x/notes.md", "can't write this protected path"],
    ["add", ".claude/skills/x/helper.sh", "can't write this protected path"],
    ["add", ".claude/agents/x.md", "can't write this protected path"],
    ["modify", ".claude/commands/run-evals.md", "can't write this protected path"],
    ["modify", "scripts/verify/run.ts", "can't write this protected path"],
    ["modify", "scripts/check-pr/config.ts", "can't write this protected path"],
    ["add", "evals/x/cases/y/.env", "dotfile"],
    ["add", "evals/x/cases/y/.gitattributes", "dotfile"],
    ["add", "lint-rules/.git/hooks/pre-commit", "dotfile"],
    ["add", "src/features/blob/.claude/skills/x/SKILL.md", "dotfile"],
    ["add", "src/features/blob/.claude/settings.json", "dotfile"],
    ["add", ".vscode/tasks.json", "dotfile"],
    ["add", "evals/x/cases/y/CLAUDE.md", "only the root CLAUDE.md"],
    ["add", "src/features/blob/AGENTS.md", "only the root CLAUDE.md"],
    ["add", ".claude/skills/a`b/SKILL.md", "use only letters"],
    ["add", ".claude/skills/a b/SKILL.md", "use only letters"],
  ] as const)("refuses to %s %s", (change, path, reason) => {
    expect(postmortemPathProblem(path, change, config, at(path))).toContain(reason);
  });

  it("refuses an addition that clashes with a file HEAD has, by case or by extension", () => {
    const existing = [".claude/skills/postmortem", ".claude/skills/postmortem/SKILL.md", "scripts/agent-tools/public-env.ts", "scripts/agent-tools/x"];
    const add = (path: string) => postmortemPathProblem(path, "add", config, at(path, existing));
    expect(add(".claude/skills/Postmortem/SKILL.md")).toContain("differs only in case from .claude/skills/postmortem/SKILL.md");
    expect(add(".claude/skills/postmortem-two/SKILL.md")).toBeUndefined();
    expect(add("scripts/agent-tools/public-env.test.ts")).toBeUndefined();
    expect(add("src/features/blob/lib/public-env.js")).toBeUndefined();
    expect(postmortemPathProblem("scripts/agent-tools/public-env.js", "add", config, { protectedPath: false, existing })).toContain(
      "named like scripts/agent-tools/public-env.ts with another extension",
    );
    expect(postmortemPathProblem("scripts/agent-tools/x.ts", "add", config, { protectedPath: false, existing })).toContain("named like scripts/agent-tools/x");
  });

  it("matches case-insensitively when asked, for a Windows checkout", () => {
    expect(postmortemPathProblem("ESLINT.config.mjs", "modify", config, at("ESLINT.config.mjs"))).toContain("can't write");
    expect(postmortemPathProblem("ESLINT.config.mjs", "modify", config, { ...at("ESLINT.config.mjs"), ignoreCase: true })).toBeUndefined();
    expect(postmortemPathProblem("lint-rules/claude.md", "add", config, { ...at("lint-rules/claude.md"), ignoreCase: true })).toContain("only the root CLAUDE.md");
  });
});
