import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VerifyError } from "./verify-error";
import { prepareBaseWorktree, resolveCommit, shareEnvLocal, worktreePaths } from "./worktree";

const cleanup: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" }).trim();
}

function repoWithTwoCommits(): { root: string; first: string; second: string } {
  const root = mkdtempSync(join(tmpdir(), "worktree-repo-"));
  cleanup.push(root);
  git(root, "init", "-q");
  writeFileSync(join(root, "page.txt"), "before");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "first");
  const first = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "page.txt"), "after");
  git(root, "commit", "-q", "-am", "second");
  return { root, first, second: git(root, "rev-parse", "HEAD") };
}

function parentDir(): string {
  const parent = mkdtempSync(join(tmpdir(), "worktree-parent-"));
  cleanup.push(parent);
  return parent;
}

afterEach(() => {
  for (const dir of cleanup.splice(0).reverse()) rmSync(dir, { recursive: true, force: true });
});

describe("resolveCommit", { timeout: 30_000 }, () => {
  it("resolves branches, relative refs and shas", () => {
    const { root, first, second } = repoWithTwoCommits();
    expect(resolveCommit(root, "HEAD")).toBe(second);
    expect(resolveCommit(root, "HEAD~1")).toBe(first);
    expect(resolveCommit(root, first.slice(0, 10))).toBe(first);
  });

  it.each(["nope", "", "--output=/tmp/x", "-h"])("rejects %j as a VerifyError", (ref) => {
    const { root } = repoWithTwoCommits();
    expect(() => resolveCommit(root, ref)).toThrow(VerifyError);
  });
});

describe("prepareBaseWorktree", { timeout: 30_000 }, () => {
  it("checks the base out once, reuses it, and removes older base worktrees", () => {
    const { root, first, second } = repoWithTwoCommits();
    const parent = parentDir();

    const base = prepareBaseWorktree(root, first, parent);
    expect(base).toEqual({ dir: join(parent, first.slice(0, 12)), created: true });
    expect(readFileSync(join(base.dir, "page.txt"), "utf8")).toBe("before");
    expect(prepareBaseWorktree(root, first, parent)).toEqual({ dir: base.dir, created: false });

    const next = prepareBaseWorktree(root, second, parent);
    expect(next.created).toBe(true);
    expect(readFileSync(join(next.dir, "page.txt"), "utf8")).toBe("after");
    expect(existsSync(base.dir)).toBe(false);
    expect(worktreePaths(root)).toHaveLength(2);
  });

  it("leaves worktrees outside its parent folder alone", () => {
    const { root, first, second } = repoWithTwoCommits();
    const elsewhere = join(parentDir(), "mine");
    git(root, "worktree", "add", "--detach", elsewhere, first);
    prepareBaseWorktree(root, second, parentDir());
    expect(existsSync(join(elsewhere, "page.txt"))).toBe(true);
    expect(worktreePaths(root)).toHaveLength(3);
  });

  it("reports a git failure as a VerifyError that quotes git", () => {
    expect(() => prepareBaseWorktree(parentDir(), "0123456789abcdef", parentDir())).toThrow(/^git worktree list --porcelain failed: fatal: not a git repository/);
  });

  it("recreates a base worktree whose folder was deleted", () => {
    const { root, first } = repoWithTwoCommits();
    const parent = parentDir();
    const base = prepareBaseWorktree(root, first, parent);
    rmSync(base.dir, { recursive: true, force: true });
    expect(prepareBaseWorktree(root, first, parent)).toEqual({ dir: base.dir, created: true });
    expect(readFileSync(join(base.dir, "page.txt"), "utf8")).toBe("before");
  });
});

describe("shareEnvLocal", () => {
  it("copies .env.local into the base worktree when there is one", () => {
    const root = parentDir();
    const dir = parentDir();
    shareEnvLocal(root, dir);
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
    writeFileSync(join(root, ".env.local"), "A=1\n");
    shareEnvLocal(root, dir);
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe("A=1\n");
  });
});
