import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { GUARDRAILS_CONFIG_PATH, loadGuardrailsConfig } from "../../../scripts/check-pr/config.ts";
import { globToRegExp, toRepoPath } from "../../../scripts/check-pr/glob.ts";

export type PathGuard = {
  readonly projectRoot: string;
  readonly caseInsensitive: boolean;
};

export const localOnlyProtectedPaths: readonly string[] = [".git/**", ".claude/settings.local.json"];

const secretFileNames = [/^\.env(\..+)?$/i, /^\.git-credentials$/i, /^[._]netrc$/i, /^id_(rsa|dsa|ecdsa|ed25519)$/i];
const sampleSuffix = /\.(example|sample|template)$/i;

export const projectRoot = join(import.meta.dirname, "..", "..", "..");

export function isSecretFile(path: string): boolean {
  const name = basename(toRepoPath(path));
  return !sampleSuffix.test(name) && secretFileNames.some((pattern) => pattern.test(name));
}

export function toNativePath(path: string, windows: boolean): string {
  const drive = /^\/([a-zA-Z])(\/|$)/.exec(path);
  return windows && drive?.[1] ? `${drive[1].toUpperCase()}:/${path.slice(3)}` : path;
}

export function findRepoRoot(start: string): string | undefined {
  let directory = start;
  for (;;) {
    if (existsSync(join(directory, ".git"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function protectedGlobs(root: string, fallbackRoot: string): readonly string[] {
  const configRoot = existsSync(join(root, GUARDRAILS_CONFIG_PATH)) ? root : fallbackRoot;
  return [...loadGuardrailsConfig(configRoot).protectedPaths, ...localOnlyProtectedPaths];
}

export function protectedRepoPath(path: string, cwd: string, guard: PathGuard): string | undefined {
  const absolute = resolve(cwd, toNativePath(path, guard.caseInsensitive));
  const root = findRepoRoot(dirname(absolute)) ?? guard.projectRoot;
  const inside = relative(root, absolute);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return undefined;
  const repoPath = toRepoPath(inside);
  const flags = guard.caseInsensitive ? "i" : "";
  const matched = protectedGlobs(root, guard.projectRoot).some((glob) => new RegExp(globToRegExp(glob).source, flags).test(repoPath));
  return matched ? repoPath : undefined;
}
