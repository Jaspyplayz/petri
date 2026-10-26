import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { GUARDRAILS_CONFIG_PATH, loadGuardrailsConfig } from "../../../scripts/check-pr/config.ts";
import { globToRegExp, toRepoPath } from "../../../scripts/check-pr/glob.ts";
import { postmortemPathProblem } from "../../../scripts/check-pr/postmortem-paths.ts";

export type PathGuard = {
  readonly projectRoot: string;
  readonly caseInsensitive: boolean;
};

export const localOnlyProtectedPaths: readonly string[] = ["**/.git", "**/.git/**", ".claude/settings.local.json"];

const secretFileNames = [/^\.env(\..+)?$/i, /^\.git-credentials$/i, /^[._]netrc$/i, /^id_(rsa|dsa|ecdsa|ed25519)$/i];
const agentConfigFile = /(^|\/)(\.claude\/(settings(\.local)?\.json|CLAUDE\.md)|\.claude\.json|managed-settings\.json|\.gitconfig|\.config\/git\/config)$/i;
const sampleSuffix = /\.(example|sample|template)$/i;

export const projectRoot = join(import.meta.dirname, "..", "..", "..");

export function isSecretFile(path: string): boolean {
  const name = basename(toRepoPath(path));
  return !sampleSuffix.test(name) && secretFileNames.some((pattern) => pattern.test(name));
}

export function secretTarget(path: string, cwd: string, windows: boolean): boolean {
  return isSecretFile(path) || isSecretFile(realPath(resolve(cwd, toNativePath(path, windows))));
}

export function toNativePath(path: string, windows: boolean): string {
  const drive = /^\/([a-zA-Z])(\/|$)/.exec(path);
  return windows && drive?.[1] ? `${drive[1].toUpperCase()}:/${path.slice(3)}` : path;
}

function repoRoots(start: string): string[] {
  const roots: string[] = [];
  let directory = start;
  for (;;) {
    if (existsSync(join(directory, ".git"))) roots.push(directory);
    const parent = dirname(directory);
    if (parent === directory) return roots;
    directory = parent;
  }
}

export function findRepoRoot(start: string): string | undefined {
  return repoRoots(start)[0];
}

function contains(parent: string, child: string): boolean {
  const inside = relative(parent, child);
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
}

function gitdirOf(root: string): string | undefined {
  const marker = join(root, ".git");
  if (!existsSync(marker) || lstatSync(marker).isDirectory()) return undefined;
  const gitdir = /^gitdir:\s*(.+)$/m.exec(readFileSync(marker, "utf8"))?.[1]?.trim();
  return gitdir === undefined ? undefined : resolve(root, gitdir);
}

export function isTrustedRoot(root: string, trustedRoot: string): boolean {
  if (relative(trustedRoot, root) === "") return true;
  const gitdir = gitdirOf(root);
  return gitdir !== undefined && contains(join(trustedRoot, ".git", "worktrees"), gitdir);
}

// Only git writes under .git, so the back-link there means git registered this folder as a worktree, as `git worktree add` does.
function isLinkedWorktree(root: string, main: string): boolean {
  const gitdir = gitdirOf(root);
  if (gitdir === undefined || relative(join(main, ".git", "worktrees"), dirname(gitdir)) !== "") return false;
  const backLink = join(gitdir, "gitdir");
  return existsSync(backLink) && relative(join(root, ".git"), resolve(gitdir, readFileSync(backLink, "utf8").trim())) === "";
}

export function realPath(path: string, links = 0): string {
  if (existsSync(path)) return realpathSync(path);
  if (links < 16 && lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
    return realPath(resolve(dirname(path), readlinkSync(path)), links + 1);
  }
  const parent = dirname(path);
  return parent === path ? path : join(realPath(parent, links), basename(path));
}

function protectedGlobs(root: string, fallbackRoot: string): readonly string[] {
  const configRoot = existsSync(join(root, GUARDRAILS_CONFIG_PATH)) ? root : fallbackRoot;
  return [...loadGuardrailsConfig(configRoot).protectedPaths, ...localOnlyProtectedPaths];
}

function protectedWithin(absolute: string, guard: PathGuard): string | undefined {
  const flags = guard.caseInsensitive ? "i" : "";
  const enclosing = repoRoots(dirname(absolute));
  // Only Claude Code's worktree folder is exempt, so a worktree placed in a protected folder can't lift its rules.
  for (const root of [guard.projectRoot, ...enclosing]) {
    if (!contains(root, absolute) || enclosing.some((nested) => contains(join(root, ".claude", "worktrees"), nested) && isLinkedWorktree(nested, root))) continue;
    const repoPath = toRepoPath(relative(root, absolute));
    if (protectedGlobs(root, guard.projectRoot).some((glob) => new RegExp(globToRegExp(glob).source, flags).test(repoPath))) return repoPath;
  }
  return undefined;
}

function agentConfig(path: string): string | undefined {
  const slashed = toRepoPath(path);
  return agentConfigFile.test(slashed) ? slashed : undefined;
}

export function protectedRepoPath(path: string, cwd: string, guard: PathGuard): string | undefined {
  const absolute = resolve(cwd, toNativePath(path, guard.caseInsensitive));
  const real = realPath(absolute);
  return protectedWithin(absolute, guard) ?? protectedWithin(real, guard) ?? agentConfig(absolute) ?? agentConfig(real);
}

function headGit(args: readonly string[], root: string): { readonly status: number | null; readonly stdout: string } {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.error !== undefined) throw result.error;
  return result;
}

function inHead(repoPath: string, root: string): boolean {
  return headGit(["cat-file", "-e", `HEAD:${repoPath}`], root).status === 0;
}

function headSiblings(repoPath: string, root: string): string[] {
  const slash = repoPath.lastIndexOf("/");
  const folder = slash === -1 ? [] : ["--", `${repoPath.slice(0, slash)}/`];
  return headGit(["ls-tree", "-z", "--name-only", "HEAD", ...folder], root).stdout.split("\0").filter((entry) => entry !== "");
}

// Why the postmortem agent (EVOLUTION_POSTMORTEM=1) can't write this path, or undefined if it can: a protected path
// and its real target must both be in the project and not a Claude Code settings file, and postmortemPathProblem must
// allow the change to each (writing a file HEAD has changes it; any other file is an addition).
export function postmortemProblem(path: string, cwd: string, guard: PathGuard): string | undefined {
  const absolute = resolve(cwd, toNativePath(path, guard.caseInsensitive));
  const protectedPath = protectedRepoPath(path, cwd, guard) !== undefined;
  const config = loadGuardrailsConfig(guard.projectRoot);
  for (const target of [absolute, realPath(absolute)]) {
    const inside = relative(guard.projectRoot, target);
    if (inside === "" || inside.startsWith("..") || isAbsolute(inside) || agentConfig(target) !== undefined) {
      if (protectedPath) return "a postmortem writes protected files only inside the project, and never a Claude Code settings file";
      continue;
    }
    const repoPath = toRepoPath(inside);
    const change = inHead(repoPath, guard.projectRoot) ? "modify" : "add";
    const existing = change === "add" ? headSiblings(repoPath, guard.projectRoot) : [];
    const problem = postmortemPathProblem(repoPath, change, config, { ignoreCase: guard.caseInsensitive, protectedPath, existing });
    if (problem !== undefined) return problem;
  }
  return undefined;
}
