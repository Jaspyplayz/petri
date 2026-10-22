import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { toRepoPath } from "../../scripts/check-pr/glob.ts";
import { asRecord, parseJsonRecord } from "../../scripts/check-pr/json.ts";
import { block, parseHookInput, readStdin } from "./lib/hook-input.ts";
import { findRepoRoot, isTrustedRoot, projectRoot, toNativePath } from "./lib/paths.ts";

const run = promisify(execFile);
const maxLines = 40;

const input = parseHookInput(await readStdin());
const filePath = input.toolInput.file_path;
if (typeof filePath !== "string") process.exit(0);

const absolute = resolve(input.cwd ?? projectRoot, toNativePath(filePath, process.platform === "win32"));
const root = findRepoRoot(dirname(absolute)) ?? projectRoot;
const repoPath = toRepoPath(relative(root, absolute));
if (!/^src\/.+\.(ts|tsx|mts|cts)$/.test(repoPath) || !isTrustedRoot(root, projectRoot)) process.exit(0);

function binOf(packageName: string, bin: string): string {
  const manifestPath = createRequire(join(projectRoot, "package.json")).resolve(`${packageName}/package.json`);
  const relativeBin = asRecord(parseJsonRecord(readFileSync(manifestPath, "utf8"))?.bin)?.[bin];
  if (typeof relativeBin !== "string") throw new Error(`${packageName} has no "${bin}" bin`);
  return join(dirname(manifestPath), relativeBin);
}

async function check(name: string, args: readonly string[]): Promise<string | undefined> {
  try {
    await run(process.execPath, [...args], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    return undefined;
  } catch (error) {
    const output = error instanceof Error && "stdout" in error ? `${String(error.stdout)}${"stderr" in error ? String(error.stderr) : ""}` : String(error);
    const lines = output.trim().split("\n");
    const shown = lines.slice(0, maxLines).join("\n");
    return `${name}:\n${shown}${lines.length > maxLines ? `\n… ${String(lines.length - maxLines)} more lines` : ""}`;
  }
}

const failures = (
  await Promise.all([
    check("tsc --noEmit", [binOf("typescript", "tsc"), "--noEmit", "--pretty", "false", "-p", "tsconfig.json"]),
    check(`eslint ${repoPath}`, [binOf("eslint", "eslint"), "--max-warnings=0", "--no-warn-ignored", repoPath]),
  ])
).filter((failure) => failure !== undefined);

if (failures.length > 0) block([`Typecheck/lint found problems after editing ${repoPath}. Fix them before moving on.`, ...failures].join("\n\n"));
