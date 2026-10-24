import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VerifyError } from "./verify-error";
import { prepareBaseCheckout, resolveCommit, shareEnvLocal } from "./worktree";

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

describe("prepareBaseCheckout", { timeout: 30_000 }, () => {
  it("checks the base out once, reuses it, and removes older base checkouts", () => {
    const { root, first, second } = repoWithTwoCommits();
    const parent = parentDir();

    const base = prepareBaseCheckout(root, first, parent);
    expect(base).toEqual({ dir: join(parent, first.slice(0, 12)), created: true });
    expect(readFileSync(join(base.dir, "page.txt"), "utf8")).toBe("before");
    expect(prepareBaseCheckout(root, first, parent)).toEqual({ dir: base.dir, created: false });

    const next = prepareBaseCheckout(root, second, parent);
    expect(next.created).toBe(true);
    expect(readFileSync(join(next.dir, "page.txt"), "utf8")).toBe("after");
    expect(existsSync(base.dir)).toBe(false);
  });

  it("writes nothing into the repo's .git, so it works when .git is read-only", () => {
    const { root, first } = repoWithTwoCommits();
    const worktrees = git(root, "worktree", "list", "--porcelain");
    const refs = git(root, "for-each-ref");
    prepareBaseCheckout(root, first, parentDir());
    expect(git(root, "worktree", "list", "--porcelain")).toBe(worktrees);
    expect(git(root, "for-each-ref")).toBe(refs);
    expect(existsSync(join(root, ".git", "worktrees"))).toBe(false);
  });

  it("checks out a commit no branch points at", () => {
    const { root, first, second } = repoWithTwoCommits();
    git(root, "reset", "-q", "--hard", first);
    const base = prepareBaseCheckout(root, second, parentDir());
    expect(readFileSync(join(base.dir, "page.txt"), "utf8")).toBe("after");
  });

  it("leaves other folders in its parent alone", () => {
    const { root, first } = repoWithTwoCommits();
    const parent = parentDir();
    mkdirSync(join(parent, "mine"));
    writeFileSync(join(parent, "mine", "keep.txt"), "x");
    prepareBaseCheckout(root, first, parent);
    expect(existsSync(join(parent, "mine", "keep.txt"))).toBe(true);
  });

  it("reports a git failure as a VerifyError that quotes git", () => {
    expect(() => prepareBaseCheckout(parentDir(), "0123456789abcdef", parentDir())).toThrow(/^git clone .* failed: fatal: /);
  });

  it("recreates a base checkout whose folder was deleted or left half made", () => {
    const { root, first } = repoWithTwoCommits();
    const parent = parentDir();
    const base = prepareBaseCheckout(root, first, parent);
    rmSync(base.dir, { recursive: true, force: true });
    expect(prepareBaseCheckout(root, first, parent)).toEqual({ dir: base.dir, created: true });
    rmSync(join(base.dir, ".git"), { recursive: true, force: true });
    expect(prepareBaseCheckout(root, first, parent)).toEqual({ dir: base.dir, created: true });
    expect(readFileSync(join(base.dir, "page.txt"), "utf8")).toBe("before");
  });
});

describe("shareEnvLocal", () => {
  it("copies .env.local into the base checkout when there is one", () => {
    const root = parentDir();
    const dir = parentDir();
    shareEnvLocal(root, dir);
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
    writeFileSync(join(root, ".env.local"), "A=1\n");
    shareEnvLocal(root, dir);
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe("A=1\n");
  });
});
