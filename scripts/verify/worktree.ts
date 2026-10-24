import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { VerifyError } from "./verify-error";

function git(cwd: string, args: readonly string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const lines = stderr.split(/\r?\n/).filter((line) => line.trim() !== "");
    throw new VerifyError(`git ${args.join(" ")} failed${lines.length === 0 ? "" : `: ${lines.slice(-3).join(" / ")}`}`);
  }
}

function normalized(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

export function resolveCommit(root: string, ref: string): string {
  if (ref === "" || ref.startsWith("-")) throw new VerifyError(`not a git ref: ${JSON.stringify(ref)}`);
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    throw new VerifyError(`no commit for ${JSON.stringify(ref)}; fetch it first or pass a branch, tag or sha`);
  }
}

const BASE_DIR_NAME = /^[0-9a-f]{12}$/;

function checkedOutAt(dir: string): string | undefined {
  if (!existsSync(join(dir, ".git"))) return undefined;
  try {
    return git(dir, ["rev-parse", "HEAD"]);
  } catch {
    return undefined;
  }
}

export function prepareBaseCheckout(root: string, sha: string, parent: string): { dir: string; created: boolean } {
  const dir = join(parent, sha.slice(0, 12));
  mkdirSync(parent, { recursive: true });
  for (const name of readdirSync(parent).filter((entry) => BASE_DIR_NAME.test(entry))) {
    const other = join(parent, name);
    if (normalized(other) !== normalized(dir)) rmSync(other, { recursive: true, force: true });
  }
  if (checkedOutAt(dir) === sha) return { dir, created: false };
  rmSync(dir, { recursive: true, force: true });
  git(parent, ["clone", "--quiet", "--shared", "--no-checkout", root, dir]);
  git(dir, ["checkout", "--quiet", "--detach", sha]);
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
    if (result.status !== 0) throw new VerifyError(`pnpm install failed in the base checkout; see ${logPath}`);
  } finally {
    closeSync(fd);
  }
}

export function shareEnvLocal(root: string, dir: string): void {
  const envLocal = join(root, ".env.local");
  if (existsSync(envLocal)) copyFileSync(envLocal, join(dir, ".env.local"));
}
