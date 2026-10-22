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
  };

  it.each([
    ["bash <<'EOF'\ngit push --force\nEOF", "force pushes"],
    ["python3.12 - <<'EOF'\nimport os\nprint(os.environ)\nEOF", "print a secret"],
    ["nodejs -e \"require('child_process').execSync('git push --force')\"", "force pushes"],
    ["git apply <<'EOF'\n--- a/eslint.config.mjs\n+++ b/eslint.config.mjs\nEOF", "patch, git apply and git am are off"],
    ["patch -p1 < fix.patch", "patch, git apply and git am are off"],
    ["git diff main | git -C sub apply -R", "patch, git apply and git am are off"],
    ["git -C .github rm workflows/ci.yml", ".github/workflows/ci.yml is a protected path"],
    ["git -C ~/petri/.github rm workflows/ci.yml", ".github/workflows/ci.yml is a protected path"],
    ['git -C "$HOME/petri" rm .github/workflows/ci.yml', ".github/workflows/ci.yml is a protected path"],
    ['rm "$PWD/.github/workflows/ci.yml"', ".github/workflows/ci.yml is a protected path"],
    ["echo x > `pwd`/eslint.config.mjs", "eslint.config.mjs is a protected path"],
    ["echo x > $(pwd)/eslint.config.mjs", "eslint.config.mjs is a protected path"],
    ["echo $(git push --force)", "force pushes"],
    ["echo $(echo $(echo $(echo $(echo $(git push -f)))))", "force pushes"],
    ["cat `echo .env.setup`", "env and credential files"],
    ["git --git-dir .git push --force", "force pushes"],
    ["git --work-tree . --git-dir .git apply x.patch", "patch, git apply and git am are off"],
    ["git --git-dir status -c core.hooksPath=/dev/null commit -m x", "git hooks are guardrails"],
    ["git --config-env=core.hooksPath=EMPTY commit -m x", "git hooks are guardrails"],
    ["git -c alias.p=push p --force", "git aliases"],
    ["git config --global alias.p 'push --force'", "git aliases"],
    ["busybox patch -p1 < fix.patch", "patch, git apply and git am are off"],
    ["gpatch -p1 < fix.patch", "patch, git apply and git am are off"],
    ["sort --compress-prog=sh -c 'git push -f' x", "force pushes"],
    ["gh alias set p '!git push --force'", "force pushes"],
    ["rg --pre 'sh -c \"git push -f\"' pattern", "force pushes"],
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
    expect(commandProblem('git commit -m "$(cat msg.txt)" && echo "$(date)" > notes.md', guard)).toBeUndefined();
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
