import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type SourceFile = { readonly path: string; readonly content: string | Buffer };

const buildInputs = [
  /^src\//,
  /^public\//,
  /^next\.config\.[cm]?[jt]s$/,
  /^postcss\.config\.[cm]?[jt]s$/,
  /^(package\.json|pnpm-lock\.yaml|tsconfig\.json)$/,
];
const notBuildInputs = /\.(test|e2e)\.tsx?$|\.md$/;
const envFilesNextLoads = [".env", ".env.local", ".env.production", ".env.production.local"];

export function isBuildInput(path: string): boolean {
  return buildInputs.some((pattern) => pattern.test(path)) && !notBuildInputs.test(path);
}

export function fingerprintFiles(files: readonly SourceFile[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of sorted) {
    hash.update(file.path).update("\0").update(file.content).update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

export function sourceFingerprint(root: string): string {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => path !== "" && isBuildInput(path));
  const paths = [...new Set([...listed, ...envFilesNextLoads])].filter((path) => existsSync(join(root, path)));
  return fingerprintFiles(paths.map((path) => ({ path, content: readFileSync(join(root, path)) })));
}
