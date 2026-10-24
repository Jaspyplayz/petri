import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allowedToolsLists, allowedToolsProblems, pnpmRuleProblem, splitRules } from "./allowed-tools";

const root = join(import.meta.dirname, "..", "..");
const scripts = new Set(Object.keys((JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts));

describe("pnpmRuleProblem", () => {
  it("catches the #63 builder's rule, which never matched pnpm verify:flow", () => {
    expect(pnpmRuleProblem("Bash(pnpm verify:*)", scripts)).toBe(
      'Bash(pnpm verify:*) only allows "pnpm verify …", and "verify" isn\'t a script in package.json. Name each script, for example Bash(pnpm verify:flow:*)',
    );
  });

  it.each(["Bash(pnpm verify:flow:*)", "Bash(pnpm verify:flow *)", "Bash(pnpm verify:all)", "Bash(pnpm check)", "Bash(pnpm new:feature:*)", "Bash(pnpm test:*)"])(
    "accepts %s, which names a whole script",
    (rule) => {
      expect(pnpmRuleProblem(rule, scripts)).toBeUndefined();
    },
  );

  it("catches a flag before the script name", () => {
    expect(pnpmRuleProblem("Bash(pnpm -s check)", scripts)).toContain("puts a flag before the script name");
  });

  it("ignores rules that aren't pnpm", () => {
    expect(pnpmRuleProblem("Bash(git diff:*)", scripts)).toBeUndefined();
    expect(pnpmRuleProblem("Read", scripts)).toBeUndefined();
  });
});

describe("splitRules", () => {
  it("splits on commas outside parentheses", () => {
    expect(splitRules("Read,Bash(pnpm check),Bash(git diff:*)")).toEqual(["Read", "Bash(pnpm check)", "Bash(git diff:*)"]);
  });
});

describe("the workflows' --allowedTools", () => {
  const dir = join(root, ".github", "workflows");
  const workflows = new Map(readdirSync(dir).map((file) => [file, readFileSync(join(dir, file), "utf8")] as const));

  it("include the builder's list", () => {
    expect(allowedToolsLists(workflows.get("evolution-build.yml") ?? "").some((list) => list.includes("Bash(pnpm check)"))).toBe(true);
  });

  it("only name whole package.json scripts", () => {
    expect(allowedToolsProblems(workflows, scripts)).toEqual([]);
  });

  it("would have failed on the list before #67", () => {
    const before = new Map([["evolution-build.yml", '--allowedTools "Read,Bash(pnpm check),Bash(pnpm verify:*),Bash(pnpm featuremap)"']]);
    expect(allowedToolsProblems(before, scripts)).toHaveLength(1);
  });
});
