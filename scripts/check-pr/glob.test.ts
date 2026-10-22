import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAny, toRepoPath } from "./glob";

describe("globToRegExp", () => {
  it.each([
    [".github/**", ".github/workflows/ci.yml", true],
    [".github/**", ".github", false],
    ["scripts/check-*", "scripts/check-features.ts", true],
    ["scripts/check-*", "scripts/check-pr/glob.ts", false],
    ["scripts/check-*/**", "scripts/check-pr/glob.ts", true],
    ["scripts/check-*/**", "scripts/checker/glob.ts", false],
    ["tsconfig*.json", "tsconfig.json", true],
    ["tsconfig*.json", "tsconfig.build.json", true],
    ["tsconfig*.json", "src/tsconfig.json", false],
    ["eslint.config.*", "eslint.config.mjs", true],
    ["**/yarn.lock", "yarn.lock", true],
    ["**/yarn.lock", "packages/a/yarn.lock", true],
    ["src/**/server/**/*.ts", "src/features/a/server/x.ts", true],
    ["vitest.config.{ts,mts}", "vitest.config.mts", true],
    ["vitest.config.{ts,mts}", "vitest.config.js", false],
    ["CLAUDE.md", "docs/CLAUDE.md", false],
    ["file?.txt", "file1.txt", true],
    ["a+b.txt", "a+b.txt", true],
    ["a+b.txt", "aab.txt", false],
  ])("%s vs %s → %s", (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });

  it("rejects an unclosed brace", () => {
    expect(() => globToRegExp("a{b,c")).toThrow(/Unclosed/);
  });
});

describe("matchesAny", () => {
  it("normalises Windows separators and leading ./", () => {
    expect(toRepoPath(".\\scripts\\check-pr\\glob.ts")).toBe("scripts/check-pr/glob.ts");
    expect(matchesAny("./.claude/settings.json", [".claude/settings.json"])).toBe(true);
    expect(matchesAny("src/app/page.tsx", [".github/**", "CLAUDE.md"])).toBe(false);
  });
});
