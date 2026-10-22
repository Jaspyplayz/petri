import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { commandProblem, type CommandGuard } from "./commands";
import { isTrustedRoot, projectRoot, protectedRepoPath, secretTarget } from "./paths";

const caseInsensitive = process.platform === "win32";
const scratch = mkdtempSync(join(tmpdir(), "petri-hooks-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function fakeRepo(name: string): string {
  const root = join(scratch, name);
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, ".github"), { recursive: true });
  copyFileSync(join(projectRoot, ".github/guardrails.json"), join(root, ".github/guardrails.json"));
  return root;
}

describe("protected paths can't be escaped", () => {
  it("ignores a planted .git marker that would make .github look like its own repo", () => {
    const root = fakeRepo("planted-marker");
    mkdirSync(join(root, ".github/.git"));
    expect(protectedRepoPath(join(root, ".github/workflows/ci.yml"), root, { projectRoot: root, caseInsensitive })).toBe(".github/workflows/ci.yml");
  });

  it("protects .git entries anywhere in the tree", () => {
    const guard = { projectRoot, caseInsensitive };
    expect(protectedRepoPath(join(projectRoot, ".github/.git"), projectRoot, guard)).toBe(".github/.git");
    expect(protectedRepoPath(join(projectRoot, "src/.git/config"), projectRoot, guard)).toBe("src/.git/config");
  });

  it("follows a directory link into a protected path", () => {
    const link = join(scratch, "github-link");
    symlinkSync(join(projectRoot, ".github"), link, "junction");
    expect(protectedRepoPath(join(link, "workflows/ci.yml"), scratch, { projectRoot, caseInsensitive })).toBe(".github/workflows/ci.yml");
  });

  it("follows a file link to a secret file, where the platform lets unprivileged users create one", () => {
    const secret = join(scratch, ".env.setup");
    writeFileSync(secret, "NOT_A_REAL_SECRET=1\n");
    const link = join(scratch, "notes.txt");
    let created = true;
    try {
      symlinkSync(secret, link, "file");
    } catch (error) {
      created = false;
      expect(process.platform).toBe("win32");
      expect(String(error)).toContain("EPERM");
    }
    expect(secretTarget("notes.txt", scratch, caseInsensitive)).toBe(created);
  });
});

describe("heredocs fed to an interpreter are checked", () => {
  const guard: CommandGuard = {
    evolutionHuman: false,
    protectedTarget: (path) => protectedRepoPath(path, projectRoot, { projectRoot, caseInsensitive }),
    secretPath: (path) => secretTarget(path, projectRoot, caseInsensitive),
    readPatch: (path) => (path === "fix.patch" ? "--- a/vitest.config.ts\n+++ b/vitest.config.ts\n@@ -1 +1 @@\n" : undefined),
  };

  it.each([
    ["bash <<'EOF'\ngit push --force\nEOF", "force pushes"],
    ["python3.12 - <<'EOF'\nimport os\nprint(os.environ)\nEOF", "print a secret"],
    ["nodejs -e \"require('child_process').execSync('git push --force')\"", "force pushes"],
    ["git apply <<'EOF'\ndiff --git a/eslint.config.mjs b/eslint.config.mjs\n--- a/eslint.config.mjs\n+++ b/eslint.config.mjs\nEOF", "eslint.config.mjs is a protected path"],
    ["patch -p1 < fix.patch", "vitest.config.ts is a protected path"],
    ["cat <<'EOF' | sh\nrm -rf /\nEOF", "recursive delete"],
    ["python3 - <<'EOF'\nimport os\nprint(os.environ)\nEOF", "print a secret"],
    ["mkdir -p .github/.git", ".github/.git is a protected path"],
  ])("%s", (command, reason) => {
    expect(commandProblem(command, guard)).toContain(reason);
  });

  it("still lets data heredocs and messages through", () => {
    expect(commandProblem("cat > notes.md <<'EOF'\nnever run git push --force\nEOF", guard)).toBeUndefined();
    expect(commandProblem("git commit -F - <<'EOF'\nfix: block rm -rf / and git push --force\nEOF", guard)).toBeUndefined();
    expect(commandProblem('gh pr comment 8 --body "blocks git push --force"', guard)).toBeUndefined();
    expect(commandProblem("git apply <<'EOF'\n--- a/src/features/blob/lib/blob-state.ts\n+++ b/src/features/blob/lib/blob-state.ts\nEOF", guard)).toBeUndefined();
  });
});

describe("check-file only runs this repo's tools", () => {
  it("trusts this checkout and its worktrees, nothing else", () => {
    const worktree = join(scratch, "worktree");
    mkdirSync(worktree);
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(projectRoot, ".git/worktrees/feature")}\n`);
    const foreign = join(scratch, "foreign");
    mkdirSync(foreign);
    writeFileSync(join(foreign, ".git"), `gitdir: ${join(scratch, "elsewhere/.git/worktrees/x")}\n`);
    expect(isTrustedRoot(projectRoot, projectRoot)).toBe(true);
    expect(isTrustedRoot(worktree, projectRoot)).toBe(true);
    expect(isTrustedRoot(foreign, projectRoot)).toBe(false);
    expect(isTrustedRoot(fakeRepo("untrusted"), projectRoot)).toBe(false);
  });

  it("skips src files in another repository instead of running its lint config", () => {
    const root = fakeRepo("foreign-src");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/x.ts"), "export const x: any = 1;\n");
    const result = spawnSync(process.execPath, [join(projectRoot, ".claude/hooks/check-file.ts")], {
      input: JSON.stringify({ tool_name: "Write", cwd: root, tool_input: { file_path: join(root, "src/x.ts") } }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });
});
