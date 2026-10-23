import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { VerifyError } from "./verify-error";

function git(cwd: string, args: readonly string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    throw new VerifyError(`git ${args.join(" ")} failed${stderr === "" ? "" : `: ${stderr.split(/\r?\n/)[0] ?? ""}`}`);
  }
}

function normalized(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function isInside(parent: string, path: string): boolean {
  const fromParent = relative(normalized(parent), normalized(path));
  return fromParent !== "" && !fromParent.startsWith("..") && !isAbsolute(fromParent);
}

export function resolveCommit(root: string, ref: string): string {
  if (ref === "" || ref.startsWith("-")) throw new VerifyError(`not a git ref: ${JSON.stringify(ref)}`);
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    throw new VerifyError(`no commit for ${JSON.stringify(ref)}; fetch it first or pass a branch, tag or sha`);
  }
}

export function worktreePaths(root: string): string[] {
  return git(root, ["worktree", "list", "--porcelain"])
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

export function prepareBaseWorktree(root: string, sha: string, parent: string): { dir: string; created: boolean } {
  const dir = join(parent, sha.slice(0, 12));
  const existing = worktreePaths(root);
  for (const other of existing.filter((path) => isInside(parent, path) && normalized(path) !== normalized(dir))) {
    git(root, ["worktree", "remove", "--force", other]);
  }
  if (existing.some((path) => normalized(path) === normalized(dir)) && existsSync(dir)) return { dir, created: false };
  git(root, ["worktree", "prune"]);
  mkdirSync(parent, { recursive: true });
  git(root, ["worktree", "add", "--detach", "--force", dir, sha]);
  return { dir, created: true };
}

export function installBaseDependencies(dir: string, logPath: string): void {
  const pnpm = process.env.npm_execpath;
  if (pnpm === undefined || pnpm === "") throw new VerifyError("run verify:compare through pnpm, so it can install the base's dependencies");
  const viaNode = /\.[cm]?js$/.test(pnpm);
  const args = ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"];
  const fd = openSync(logPath, "w");
  try {
    const result = spawnSync(viaNode ? process.execPath : pnpm, viaNode ? [pnpm, ...args] : args, {
      cwd: dir,
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
    if (result.status !== 0) throw new VerifyError(`pnpm install failed in the base worktree; see ${logPath}`);
  } finally {
    closeSync(fd);
  }
}

export function shareEnvLocal(root: string, dir: string): void {
  const envLocal = join(root, ".env.local");
  if (existsSync(envLocal)) copyFileSync(envLocal, join(dir, ".env.local"));
}
