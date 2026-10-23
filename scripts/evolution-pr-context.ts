import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { parseNumstatZ } from "./check-pr/git";
import { prDataFromBody } from "./evolution/build";
import { fetchIssue, gh, issueNumberArg } from "./evolution/github-issue";
import { parseRawZ, patchProblems } from "./evolution/patch";

// pnpm evolution:pr-context <pr number> <pr checkout> runs from a checkout of the base (trusted code). It decides
// whether the PR is an evolution PR, checks its diff the way check-patch checks a builder's patch, and writes the
// issue's fields and the diff to artifacts/evolution/ for the verifier. Outputs: evolution, safe, reason, issue.
const root = join(import.meta.dirname, "..");
const usage = "usage: pnpm evolution:pr-context <pr number> <pr checkout dir>";

type GhPr = { number: number; body: string; headRefName: string; headRefOid: string; baseRefOid: string; labels: { name: string }[] };

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
  const pr = JSON.parse(gh(root, ["pr", "view", String(number), "--json", "number,body,headRefName,headRefOid,baseRefOid,labels"])) as GhPr;
  const labels = pr.labels.map((label) => label.name);
  const evolution =
    labels.some((label) => config.agentPullRequests.labels.includes(label)) || pr.headRefName.startsWith("evo/");
  if (!evolution) {
    output({ evolution: "false", safe: "true", reason: "not an evolution PR", issue: "" });
    return;
  }
  const data = prDataFromBody(pr.body);
  if (data === undefined) {
    output({ evolution: "true", safe: "false", reason: "the PR body has no valid evolution-pr data comment", issue: "" });
    return;
  }
  const issue = fetchIssue(root, data.issueNumber, { requireReady: false });

  const dir = resolve(prDir);
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
