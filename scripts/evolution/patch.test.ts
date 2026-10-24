import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { changeOf, parseRawZ, patchProblems, type RawChange, skillFrontmatterProblem } from "./patch";

const config = loadGuardrailsConfig(join(import.meta.dirname, "..", ".."));

function added(path: string, mode = "100644"): RawChange {
  return { oldMode: "000000", newMode: mode, status: "A", path };
}

function modified(path: string): RawChange {
  return { oldMode: "100644", newMode: "100644", status: "M", path };
}

describe("parseRawZ", () => {
  it("reads modes, status and path from git diff-index --raw -z", () => {
    const sha = "0".repeat(40);
    expect(parseRawZ(`:000000 100644 ${sha} ${sha} A\0src/a.ts\0:100644 120000 ${sha} ${sha} M\0src/b.ts\0`)).toEqual([
      { oldMode: "000000", newMode: "100644", status: "A", path: "src/a.ts" },
      { oldMode: "100644", newMode: "120000", status: "M", path: "src/b.ts" },
    ]);
    expect(parseRawZ("")).toEqual([]);
  });

  it("maps git's status to an add, a change or a delete", () => {
    expect(["A", "M", "D", "T"].map(changeOf)).toEqual(["add", "modify", "delete", "modify"]);
  });
});

describe("patchProblems", () => {
  const lines = (path: string, count: number) => [{ path, added: count, deleted: 0 }];

  it("passes a small change inside a feature", () => {
    expect(patchProblems([added("src/features/blob/lib/hat.ts")], lines("src/features/blob/lib/hat.ts", 12), config)).toEqual([]);
  });

  it("refuses protected paths, symlinks, submodules, executables and odd statuses", () => {
    expect(patchProblems([added("scripts/check.ts")], lines("scripts/check.ts", 1), config)).toEqual(["scripts/check.ts is a protected path"]);
    expect(patchProblems([added("src/features/blob/link", "120000")], [], config)).toEqual(["src/features/blob/link isn't a plain file (mode 000000 → 120000)"]);
    expect(patchProblems([added("src/features/blob/sub", "160000")], [], config)).toHaveLength(1);
    expect(patchProblems([{ oldMode: "100644", newMode: "100755", status: "M", path: "src/features/blob/x.ts" }], [], config)).toHaveLength(1);
    expect(patchProblems([{ ...added("src/features/blob/x.ts"), status: "T" }], [], config)).toEqual(["src/features/blob/x.ts has git status T"]);
  });

  it("lets a postmortem add and change what postmortemPathProblem allows, and nothing else protected", () => {
    const postmortem = { postmortem: true };
    const allowed = [
      added("evals/verify-app/cases/03-x/task.md"),
      added("scripts/agent-tools/x.test.ts"),
      modified("docs/agent-mistakes.md"),
      modified(".claude/skills/postmortem/SKILL.md"),
      modified("CLAUDE.md"),
    ];
    expect(patchProblems(allowed, lines("docs/agent-mistakes.md", 40), config, postmortem)).toEqual([]);
    expect(patchProblems([modified(".claude/skills/postmortem/SKILL.md")], [], config)).toEqual([".claude/skills/postmortem/SKILL.md is a protected path"]);
    for (const path of [".github/workflows/ci.yml", ".evolution/config.json", ".claude/hooks/guard-files.ts", "scripts/check-pr/config.ts", "evals/results.jsonl", "package.json"]) {
      expect(patchProblems([added(path)], [], config, postmortem)).toEqual([`${path}: a postmortem can't write this protected path`]);
    }
    expect(patchProblems([{ ...modified("scripts/agent-tools/workflow-limits.ts"), status: "D", newMode: "000000" }], [], config, postmortem)).toEqual([
      "scripts/agent-tools/workflow-limits.ts: a postmortem can't delete a protected file",
    ]);
    expect(patchProblems([modified("evals/verify-app/cases/01-reproduce-first/rubric.md")], [], config, postmortem)).toEqual([
      "evals/verify-app/cases/01-reproduce-first/rubric.md: a postmortem may add files here but not change existing ones",
    ]);
    expect(patchProblems([added("evals/x/cases/y/.gitattributes")], [], config, postmortem)).toEqual([
      "evals/x/cases/y/.gitattributes: a postmortem can't write a dotfile or into a dot folder",
    ]);
  });

  it("holds a postmortem's name rules on unprotected paths too, and refuses additions that clash with HEAD", () => {
    const postmortem = { postmortem: true, existing: ["scripts/agent-tools/public-env.ts", "src/features/blob/lib/blob-state.ts"] };
    expect(patchProblems([added("src/features/blob/.claude/skills/x/SKILL.md")], [], config)).toEqual(["src/features/blob/.claude/skills/x/SKILL.md is a protected path"]);
    expect(patchProblems([added("src/features/blob/.claude/skills/x/SKILL.md")], [], config, postmortem)).toEqual([
      "src/features/blob/.claude/skills/x/SKILL.md: a postmortem can't write a dotfile or into a dot folder",
    ]);
    expect(patchProblems([added("src/features/blob/lib/blob-state.js")], [], config, postmortem)).toEqual([
      "src/features/blob/lib/blob-state.js: a postmortem can't add a file named like src/features/blob/lib/blob-state.ts with another extension, which an import could pick instead",
    ]);
    expect(patchProblems([added("scripts/agent-tools/public-env.js")], [], config, postmortem)).toHaveLength(1);
  });

  it("refuses names with control, format or backtick characters, which globs, diffs and PR bodies can't show plainly", () => {
    const odd = (path: string) => `${JSON.stringify(path)} has a control, format or backtick character in its name`;
    expect(patchProblems([added("src/features/blob/a\nb.ts")], [], config)).toEqual([odd("src/features/blob/a\nb.ts")]);
    expect(patchProblems([added("src/features/blob/a`b.ts")], [], config)).toEqual([odd("src/features/blob/a`b.ts")]);
    expect(patchProblems([added("src/features/blob/a\u202eb.ts")], [], config)).toEqual([odd("src/features/blob/a\u202eb.ts")]);
    expect(patchProblems([added(".github/workflows/x\n.yml")], [], config)).toEqual([".github/workflows/x\n.yml is a protected path", odd(".github/workflows/x\n.yml")]);
  });

  it("refuses binaries, oversize and empty patches, and doesn't count generated files", () => {
    expect(patchProblems([added("src/features/blob/hat.png")], [{ path: "src/features/blob/hat.png", added: null, deleted: null }], config)).toEqual([
      "src/features/blob/hat.png is binary",
    ]);
    expect(patchProblems([added("src/features/blob/lib/big.ts")], lines("src/features/blob/lib/big.ts", 401), config)).toEqual([
      "401 changed lines is over the 400-line cap for agent PRs",
    ]);
    expect(patchProblems([], [], config)).toEqual(["the patch changes nothing"]);
    expect(patchProblems([added("FEATURE_MAP.md")], lines("FEATURE_MAP.md", 900), config)).toEqual([]);
  });
});

describe("skillFrontmatterProblem", () => {
  const skill = ".claude/skills/x/SKILL.md";

  it("allows the folder's name and a description, the frontmatter every skill here has", () => {
    expect(skillFrontmatterProblem(".claude/skills/postmortem/SKILL.md", "---\nname: postmortem\ndescription: Use after a mistake.\n---\n\n# postmortem\n")).toBeUndefined();
    expect(skillFrontmatterProblem(skill, "---\r\nname: x\r\ndescription: >-\r\n  Two\r\n  lines.\r\n---\r\n")).toBeUndefined();
  });

  it("refuses other keys, which would change what an agent may do with the skill loaded", () => {
    expect(skillFrontmatterProblem(skill, "---\nname: x\ndescription: y\nallowed-tools: Bash(*)\nhooks:\n  PreToolUse: []\n---\n")).toBe(
      "a postmortem's skill frontmatter has only name and description, not allowed-tools, hooks",
    );
    expect(skillFrontmatterProblem(skill, '---\nname: x\ndescription: y\n"model": opus\n---\n')).toContain('"model": opus');
    expect(skillFrontmatterProblem(skill, "---\nname: x\n---\n")).toBe("a skill's frontmatter is a name and a description, both text");
    expect(skillFrontmatterProblem(skill, "---\nname: x\ndescription:\n  - a\n---\n")).toBe("a skill's frontmatter is a name and a description, both text");
    expect(skillFrontmatterProblem(skill, "# x\n")).toBe("a skill starts with --- frontmatter");
  });

  it("refuses a line break only YAML sees, and a name that isn't the folder's", () => {
    expect(skillFrontmatterProblem(skill, "---\nname: x\rallowed-tools: Bash(curl:*)\ndescription: y\n---\n")).toBe(
      "a skill's frontmatter has a lone carriage return or a Unicode line break",
    );
    expect(skillFrontmatterProblem(skill, "---\nname: x\u2028hooks: {}\ndescription: y\n---\n")).toContain("Unicode line break");
    expect(skillFrontmatterProblem(skill, "---\nname: postmortem\ndescription: y\n---\n")).toBe("a skill's name is its folder's (x)");
  });
});
