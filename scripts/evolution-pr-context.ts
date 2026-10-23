import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { parseNumstatZ } from "./check-pr/git";
import { gh, issueNumberArg } from "./evolution/github-issue";
import { evolutionPrsSharingHead, isEvolutionPr, linkedIssue, PR_FIELDS, type GhPr } from "./evolution/github-pr";
import { parseRawZ, patchProblems } from "./evolution/patch";

// pnpm evolution:pr-context <pr number> <pr checkout> runs from a checkout of the base (trusted code). It decides
// whether the PR is an evolution PR, checks its diff the way check-patch checks a builder's patch, and writes the
// issue's fields and the diff to artifacts/evolution/ for the verifier. Outputs: evolution, safe, reason, issue.
const root = join(import.meta.dirname, "..");
const usage = "usage: pnpm evolution:pr-context <pr number> <pr checkout dir>";

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, Object.entries(values).map(([name, value]) => `${name}=${value.replace(/\n/g, " ")}\n`).join(""));
  process.stdout.write(`pr-context: ${JSON.stringify(values)}\n`);
}

function git(dir: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function main(): void {
  const number = issueNumberArg(process.argv[2], usage);
  const prDir = process.argv[3];
  if (prDir === undefined) throw new Error(usage);
  const config = loadGuardrailsConfig(root);
  const pr = JSON.parse(gh(root, ["pr", "view", String(number), "--json", PR_FIELDS])) as GhPr;
  if (!isEvolutionPr(pr, config)) {
    // If this commit is also the head of an evolution PR, a "not an evolution PR" success would count for that PR too.
    const shared = evolutionPrsSharingHead(root, process.env.GITHUB_REPOSITORY ?? "", pr, config);
    output({
      evolution: "false",
      safe: String(shared.length === 0),
      reason: shared.length === 0 ? "not an evolution PR" : `its head commit is also the head of evolution PR #${shared.map(String).join(", #")}`,
      issue: "",
    });
    return;
  }
  const issue = linkedIssue(root, pr);
  if (typeof issue === "string") {
    output({ evolution: "true", safe: "false", reason: issue, issue: "" });
    return;
  }

  const dir = resolve(prDir);
  // Verify the commit that was checked out. If the PR moved on since, a newer run checks the new head.
  const head = git(dir, ["rev-parse", "HEAD"]).trim();
  if (head !== pr.headRefOid) {
    output({ evolution: "true", safe: "false", reason: `the PR's head is now ${pr.headRefOid}, not the checked-out ${head}`, issue: "" });
    return;
  }
  const base = git(dir, ["merge-base", pr.baseRefOid, pr.headRefOid]).trim();
  const raw = parseRawZ(git(dir, ["diff", "--raw", "-z", "--no-renames", base, pr.headRefOid]));
  const entries = parseNumstatZ(git(dir, ["diff", "--numstat", "-z", "--no-renames", base, pr.headRefOid]));
  const problems = patchProblems(raw, entries, config);

  const out = join(root, "artifacts", "evolution");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "issue.json"), `${JSON.stringify(issue, null, 2)}\n`);
  writeFileSync(join(out, "pr.diff"), git(dir, ["diff", "--no-renames", base, pr.headRefOid]));
  output({
    evolution: "true",
    safe: String(problems.length === 0),
    reason: problems.length === 0 ? "the diff stays out of protected paths and under the size cap" : problems.join("; "),
    issue: String(issue.number),
  });
}

main();
