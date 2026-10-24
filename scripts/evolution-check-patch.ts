import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { parseNumstatZ } from "./check-pr/git";
import { isProtectedPath } from "./check-pr/protected-paths";
import { parseRawZ, patchProblems } from "./evolution/patch";

// pnpm evolution:check-patch <patch file> [--postmortem] fails unless the agent's patch is safe to apply. It applies the
// patch to a scratch index built from HEAD (the base commit), never the working tree, and checks what git recorded
// there. With --postmortem it allows postmortemWritablePaths and writes the protected ones it changes to
// $GITHUB_OUTPUT as protected (space separated), for the PR's needs-human label.
const root = join(import.meta.dirname, "..");
const usage = "usage: pnpm evolution:check-patch <patch file> [--postmortem]";

function git(args: readonly string[], index: string): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_INDEX_FILE: index } });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function main(): void {
  const [patch, flag] = process.argv.slice(2);
  if (patch === undefined || (flag !== undefined && flag !== "--postmortem")) throw new Error(usage);
  const postmortem = flag === "--postmortem";
  const index = join(tmpdir(), `evolution-index-${randomUUID()}`);
  try {
    git(["read-tree", "HEAD"], index);
    git(["apply", "--cached", patch], index);
    const raw = parseRawZ(git(["diff-index", "--cached", "--raw", "-z", "--no-renames", "HEAD"], index));
    const entries = parseNumstatZ(git(["diff-index", "--cached", "--numstat", "-z", "--no-renames", "HEAD"], index));
    const config = loadGuardrailsConfig(root);
    const problems = patchProblems(raw, entries, config, { postmortem });
    if (problems.length > 0) {
      process.stderr.write(`${problems.map((problem) => `✖ ${problem}`).join("\n")}\ncheck-patch: the agent's patch can't be used.\n`);
      process.exitCode = 1;
      return;
    }
    const touched = raw.filter((change) => isProtectedPath(change.path, config)).map((change) => change.path);
    const output = process.env.GITHUB_OUTPUT;
    if (postmortem && output) appendFileSync(output, `protected=${touched.join(" ")}\n`);
    process.stdout.write(`check-patch: ok (${String(raw.length)} file(s)${touched.length > 0 ? `; protected: ${touched.join(", ")}` : ""})\n`);
  } finally {
    rmSync(index, { force: true });
  }
}

main();
