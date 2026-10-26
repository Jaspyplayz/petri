import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type FileGuard, fileProblem } from "./files";
import { isSecretFile, postmortemProblem, projectRoot, protectedRepoPath, secretTarget, toNativePath } from "./paths";

const pathGuard = { projectRoot, caseInsensitive: process.platform === "win32" };
const agent: FileGuard = {
  evolutionHuman: false,
  protectedTarget: (path) => protectedRepoPath(path, projectRoot, pathGuard),
  secretPath: (path) => secretTarget(path, projectRoot, pathGuard.caseInsensitive),
};
const at = (path: string) => join(projectRoot, path);

describe("fileProblem", () => {
  it.each([
    ["Write", "eslint.config.mjs"],
    ["Edit", ".github/workflows/ci.yml"],
    ["MultiEdit", "src/shared/env.ts"],
    ["Write", ".claude/settings.json"],
    ["Write", ".claude/settings.local.json"],
    ["Write", ".git/hooks/pre-commit"],
    ["Edit", "supabase/migrations/20261022000004_storage.sql"],
  ])("blocks %s on protected %s", (toolName, path) => {
    expect(fileProblem({ toolName, toolInput: { file_path: at(path) } }, agent)).toContain(`${path} is a protected path`);
  });

  it("lets a human with EVOLUTION_HUMAN=1 edit protected paths", () => {
    expect(fileProblem({ toolName: "Write", toolInput: { file_path: at("eslint.config.mjs") } }, { ...agent, evolutionHuman: true })).toBeUndefined();
  });

  it("lets the postmortem agent add and change only what the postmortem lists allow", () => {
    const postmortem: FileGuard = { ...agent, postmortemProblem: (path) => postmortemProblem(path, projectRoot, pathGuard) };
    const write = (path: string) => fileProblem({ toolName: "Write", toolInput: { file_path: at(path) } }, postmortem);
    for (const path of [".claude/skills/postmortem/SKILL.md", "CLAUDE.md", "evals/verify-app/cases/09-x/task.md", "eslint.config.mjs", "scripts/agent-tools/x.test.ts"]) {
      expect(write(path)).toBeUndefined();
    }
    for (const path of [".github/workflows/ci.yml", ".evolution/config.json", ".claude/hooks/guard-files.ts", "scripts/check-pr/config.ts", "evals/results.jsonl", "package.json"]) {
      expect(write(path)).toContain("For a postmortem: a postmortem can't write this protected path");
    }
    expect(write(".claude/settings.json")).toContain("never a Claude Code settings file");
    expect(write("scripts/agent-tools/workflow-limits.test.ts")).toContain("may add files here but not change existing ones");
    expect(write("scripts/agent-tools/workflow-limits.ts")).toContain("can't write this protected path");
    expect(write("evals/verify-app/cases/09-x/.env.sample")).toContain("dotfile");
    expect(write("src/features/x/CLAUDE.md")).toContain("only the root CLAUDE.md");
    expect(write("src/features/blob/lib/blob-state.ts")).toBeUndefined();
    expect(fileProblem({ toolName: "Write", toolInput: { file_path: join(tmpdir(), "scratch.txt") } }, postmortem)).toBeUndefined();
  });

  it("holds the postmortem's name and clash rules on unprotected paths, and blocks nested .claude folders", () => {
    const postmortem: FileGuard = { ...agent, postmortemProblem: (path) => postmortemProblem(path, projectRoot, pathGuard) };
    const write = (path: string) => fileProblem({ toolName: "Write", toolInput: { file_path: at(path) } }, postmortem);
    expect(fileProblem({ toolName: "Write", toolInput: { file_path: at("src/features/blob/.claude/skills/x/SKILL.md") } }, agent)).toContain("is a protected path");
    expect(write("src/features/blob/.claude/skills/x/SKILL.md")).toContain("dotfile");
    expect(write("src/features/blob/lib/.helper.ts")).toBe("Blocked for a postmortem: a postmortem can't write a dotfile or into a dot folder (postmortem in .github/guardrails.json).");
    expect(write("src/features/blob/lib/blob-state.js")).toContain("named like src/features/blob/lib/blob-state.ts with another extension");
    expect(write("scripts/agent-tools/public-env.js")).toContain("named like scripts/agent-tools/public-env.ts with another extension");
  });

  it("allows ordinary edits, reads of protected files and paths outside the repo", () => {
    expect(fileProblem({ toolName: "Edit", toolInput: { file_path: at("src/features/blob/lib/blob-state.ts") } }, agent)).toBeUndefined();
    expect(fileProblem({ toolName: "Read", toolInput: { file_path: at("eslint.config.mjs") } }, agent)).toBeUndefined();
    expect(fileProblem({ toolName: "Write", toolInput: { file_path: join(tmpdir(), "scratch.txt") } }, agent)).toBeUndefined();
    expect(fileProblem({ toolName: "Glob", toolInput: { pattern: "**/*", path: at(".env.setup") } }, agent)).toBeUndefined();
  });

  it("blocks reading and writing secret files, even for a human", () => {
    const human = { ...agent, evolutionHuman: true };
    expect(fileProblem({ toolName: "Read", toolInput: { file_path: at(".env.setup") } }, agent)).toContain("secrets");
    expect(fileProblem({ toolName: "Grep", toolInput: { pattern: "KEY", path: at(".env.local") } }, agent)).toContain("secrets");
    expect(fileProblem({ toolName: "Write", toolInput: { file_path: at(".env.local") } }, human)).toContain("secrets");
    expect(fileProblem({ toolName: "Read", toolInput: { file_path: at(".env.example") } }, agent)).toBeUndefined();
  });

  it("reads NotebookEdit's notebook_path", () => {
    expect(fileProblem({ toolName: "NotebookEdit", toolInput: { notebook_path: at(".github/x.ipynb") } }, agent)).toContain("protected path");
  });
});

describe("paths", () => {
  it("matches protected paths case-insensitively when the filesystem is", () => {
    expect(protectedRepoPath("ESLINT.CONFIG.MJS", projectRoot, { projectRoot, caseInsensitive: true })).toBe("ESLINT.CONFIG.MJS");
    expect(protectedRepoPath("ESLINT.CONFIG.MJS", projectRoot, { projectRoot, caseInsensitive: false })).toBeUndefined();
  });

  it("resolves relative paths against the working directory", () => {
    expect(protectedRepoPath("../eslint.config.mjs", join(projectRoot, "src"), pathGuard)).toBe("eslint.config.mjs");
    expect(protectedRepoPath("lib/blob-state.ts", join(projectRoot, "src/features/blob"), pathGuard)).toBeUndefined();
  });

  it("recognises secret files but not their samples", () => {
    expect([".env", ".env.local", "a/.env.setup", ".git-credentials", "_netrc", "id_ed25519"].map(isSecretFile)).toEqual([true, true, true, true, true, true]);
    expect([".env.example", ".env.setup.example", "id_ed25519.pub", "env.ts", ".envrc"].map(isSecretFile)).toEqual([false, false, false, false, false]);
  });

  it("maps Git Bash drive paths to Windows paths only on Windows", () => {
    expect(toNativePath("/c/Users/x", true)).toBe("C:/Users/x");
    expect(toNativePath("/c/Users/x", false)).toBe("/c/Users/x");
  });

  describe("in a worktree nested in the main checkout", () => {
    const main = mkdtempSync(join(tmpdir(), "petri-nested-"));
    afterAll(() => {
      rmSync(main, { recursive: true, force: true });
    });
    const worktree = join(main, ".claude/worktrees/feature");
    const forged = join(main, ".claude/worktrees/forged");
    const outside = join(main, ".github/feature");
    const gitdir = join(main, ".git/worktrees/feature");
    const outsideGitdir = join(main, ".git/worktrees/outside");
    for (const [dir, root] of [[gitdir, worktree], [outsideGitdir, outside]] as const) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "gitdir"), `${join(root, ".git")}\n`);
    }
    for (const root of [main, worktree, forged, outside]) {
      mkdirSync(join(root, ".github"), { recursive: true });
      copyFileSync(join(projectRoot, ".github/guardrails.json"), join(root, ".github/guardrails.json"));
    }
    for (const root of [worktree, forged]) writeFileSync(join(root, ".git"), `gitdir: ${gitdir}\n`);
    writeFileSync(join(outside, ".git"), `gitdir: ${outsideGitdir}\n`);

    it.each([
      ["main checkout", main],
      ["worktree", worktree],
    ])("judges worktree files by the worktree's rules when the project root is the %s", (_, root) => {
      const guard = { ...pathGuard, projectRoot: root };
      expect(protectedRepoPath(join(worktree, "src/x.ts"), worktree, guard)).toBeUndefined();
      expect(protectedRepoPath(join(worktree, "scripts/x.ts"), worktree, guard)).toBe("scripts/x.ts");
      expect(protectedRepoPath(join(worktree, ".claude/hooks/x.ts"), worktree, guard)).toBe(".claude/hooks/x.ts");
    });

    it("keeps the main checkout's rules on a folder whose .git file git never linked back to", () => {
      expect(protectedRepoPath(join(forged, "src/x.ts"), forged, { ...pathGuard, projectRoot: main })).toContain(".claude/worktrees/forged/src/x.ts");
    });

    it("keeps the main checkout's rules on a linked worktree outside .claude/worktrees", () => {
      expect(protectedRepoPath(join(outside, "src/x.ts"), outside, { ...pathGuard, projectRoot: main })).toContain(".github/feature/src/x.ts");
    });
  });
});
