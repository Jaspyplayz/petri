import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { parseNumstatZ } from "./check-pr/git";
import { branchName, prDataFromBody, type BuiltIssue } from "./evolution/build";
import { fetchIssue, gh, issueNumberArg } from "./evolution/github-issue";
import { parseRawZ, patchProblems } from "./evolution/patch";

// pnpm evolution:pr-context <pr number> <pr checkout> runs from a checkout of the base (trusted code). It decides
// whether the PR is an evolution PR, checks its diff the way check-patch checks a builder's patch, and writes the
// issue's fields and the diff to artifacts/evolution/ for the verifier. Outputs: evolution, safe, reason, issue.
const root = join(import.meta.dirname, "..");
const usage = "usage: pnpm evolution:pr-context <pr number> <pr checkout dir>";

type GhPr = {
  number: number;
  body: string;
  headRefName: string;
  headRefOid: string;
  baseRefOid: string;
  isCrossRepository: boolean;
  labels: { name: string }[];
};

// A PR as the REST API returns it (GET /repos/{repo}/commits/{sha}/pulls).
type RestPr = { number: number; state: string; head: { ref: string }; labels: { name: string }[] };

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

// The issue an evolution PR implements, or why it can't be trusted to name one.
function linkedIssue(pr: GhPr): BuiltIssue | string {
  // The build workflow pushes evolution branches to this repository, never to a fork.
  if (pr.isCrossRepository) return "an evolution PR has to come from a branch of this repository";
  const data = prDataFromBody(pr.body);
  if (data === undefined) return "the PR body has no valid evolution-pr data comment";
  const issue = fetchIssue(root, data.issueNumber, { requireReady: false });
  // The body names the issue, but anyone who can edit the PR can edit the body. The branch is the one the build
  // workflow derived from that issue, so a PR can't borrow another issue's criteria.
  const expected = branchName(issue.number, issue.title);
  if (pr.headRefName !== expected) return `the branch ${pr.headRefName} isn't ${expected}, the one built for #${String(issue.number)}`;
  return issue;
}

function main(): void {
  const number = issueNumberArg(process.argv[2], usage);
  const prDir = process.argv[3];
  if (prDir === undefined) throw new Error(usage);
  const config = loadGuardrailsConfig(root);
  const pr = JSON.parse(gh(root, ["pr", "view", String(number), "--json", "number,body,headRefName,headRefOid,baseRefOid,isCrossRepository,labels"])) as GhPr;
  const labels = pr.labels.map((label) => label.name);
  const evolution =
    labels.some((label) => config.agentPullRequests.labels.includes(label)) || pr.headRefName.startsWith("evo/");
  if (!evolution) {
    // evolution-verify is a commit status, keyed by SHA. If this commit is also the head of an evolution PR, a
    // "not an evolution PR" success here would count for that PR too, so it isn't safe to report one.
    const shared = (JSON.parse(gh(root, ["api", `repos/${process.env.GITHUB_REPOSITORY ?? ""}/commits/${pr.headRefOid}/pulls`])) as RestPr[]).filter(
      (other) =>
        other.number !== pr.number &&
        other.state === "open" &&
        (other.head.ref.startsWith("evo/") || other.labels.some((label) => config.agentPullRequests.labels.includes(label.name))),
    );
    output({
      evolution: "false",
      safe: String(shared.length === 0),
      reason: shared.length === 0 ? "not an evolution PR" : `its head commit is also the head of evolution PR #${shared.map((other) => String(other.number)).join(", #")}`,
      issue: "",
    });
    return;
  }
  const issue = linkedIssue(pr);
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
