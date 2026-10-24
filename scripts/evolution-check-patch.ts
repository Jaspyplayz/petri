import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { parseNumstatZ } from "./check-pr/git";
import { isProtectedPath } from "./check-pr/protected-paths";
import { parseRawZ, patchProblems, SKILL_FILE, skillFrontmatterProblem } from "./evolution/patch";

// pnpm evolution:check-patch <patch file> [--postmortem] fails unless the agent's patch is safe to apply. It applies the
// patch to a scratch index built from HEAD (the base commit), never the working tree, and checks what git recorded
// there. With --postmortem it allows what postmortemPathProblem allows (with HEAD's files for its clash check), checks
// the frontmatter of the skills the patch writes, and writes to $GITHUB_OUTPUT the protected files it adds and modifies
// as added and modified (space separated; a postmortem's protected paths have no spaces), for the PR body and its
// needs-human label, and the patch's sha256 as digest, so publish pushes the patch this job checked.
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
    const existing = postmortem ? git(["ls-tree", "-r", "-t", "-z", "--name-only", "HEAD"], index).split("\0").filter((path) => path !== "") : [];
    const problems = patchProblems(raw, entries, config, { postmortem, existing });
    if (postmortem && problems.length === 0) {
      for (const change of raw.filter((item) => item.status !== "D" && SKILL_FILE.test(item.path))) {
        const problem = skillFrontmatterProblem(change.path, git(["show", `:${change.path}`], index));
        if (problem !== undefined) problems.push(`${change.path}: ${problem}`);
      }
    }
    if (problems.length > 0) {
      process.stderr.write(`${problems.map((problem) => `✖ ${problem}`).join("\n")}\ncheck-patch: the agent's patch can't be used.\n`);
      process.exitCode = 1;
      return;
    }
    const touched = raw.filter((change) => isProtectedPath(change.path, config));
    const added = touched.filter((change) => change.status === "A").map((change) => change.path);
    const modified = touched.filter((change) => change.status !== "A").map((change) => change.path);
    const output = process.env.GITHUB_OUTPUT;
    const digest = createHash("sha256").update(readFileSync(patch)).digest("hex");
    if (postmortem && output) appendFileSync(output, `added=${added.join(" ")}\nmodified=${modified.join(" ")}\ndigest=${digest}\n`);
    const listed = touched.length > 0 ? `; protected: ${touched.map((change) => change.path).join(", ")}` : "";
    process.stdout.write(`check-patch: ok (${String(raw.length)} file(s)${listed})\n`);
  } finally {
    rmSync(index, { force: true });
  }
}

main();
