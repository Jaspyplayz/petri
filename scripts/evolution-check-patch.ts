import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { parseNumstatZ } from "./check-pr/git";
import { patchProblems } from "./evolution/patch";

// pnpm evolution:check-patch <patch file> fails unless the builder's patch is safe to apply: no protected paths, no
// binaries, under the size cap. Run it from a clean checkout before `git apply`.
const root = join(import.meta.dirname, "..");

function main(): void {
  const patch = process.argv[2];
  if (patch === undefined) throw new Error("usage: pnpm evolution:check-patch <patch file>");
  const result = spawnSync("git", ["apply", "--numstat", "-z", patch], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git apply --numstat failed: ${result.stderr.trim()}`);
  const entries = parseNumstatZ(result.stdout);
  const problems = patchProblems(entries, loadGuardrailsConfig(root));
  if (problems.length > 0) {
    process.stderr.write(`${problems.map((problem) => `✖ ${problem}`).join("\n")}\ncheck-patch: the builder's patch can't be used.\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`check-patch: ok (${String(entries.length)} file(s))\n`);
}

main();
