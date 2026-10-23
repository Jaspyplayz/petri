import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { parseNumstatZ } from "./check-pr/git";
import { parseRawZ, patchProblems } from "./evolution/patch";

// pnpm evolution:check-patch <patch file> fails unless the builder's patch is safe to apply. It applies the patch to a
// scratch index built from HEAD (the base commit), never the working tree, and checks what git recorded there.
const root = join(import.meta.dirname, "..");

function git(args: readonly string[], index: string): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_INDEX_FILE: index } });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function main(): void {
  const patch = process.argv[2];
  if (patch === undefined) throw new Error("usage: pnpm evolution:check-patch <patch file>");
  const index = join(tmpdir(), `evolution-index-${randomUUID()}`);
  try {
    git(["read-tree", "HEAD"], index);
    git(["apply", "--cached", patch], index);
    const raw = parseRawZ(git(["diff-index", "--cached", "--raw", "-z", "--no-renames", "HEAD"], index));
    const entries = parseNumstatZ(git(["diff-index", "--cached", "--numstat", "-z", "--no-renames", "HEAD"], index));
    const problems = patchProblems(raw, entries, loadGuardrailsConfig(root));
    if (problems.length > 0) {
      process.stderr.write(`${problems.map((problem) => `✖ ${problem}`).join("\n")}\ncheck-patch: the builder's patch can't be used.\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`check-patch: ok (${String(raw.length)} file(s))\n`);
  } finally {
    rmSync(index, { force: true });
  }
}

main();
