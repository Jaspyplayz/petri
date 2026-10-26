import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { branchName, renderIssueJson } from "./evolution/build";
import { buildableIssue, gh, ISSUE_FIELDS, issueNumberArg, type GhIssue } from "./evolution/github-issue";

// pnpm evolution:pick-issue [number] picks the issue to build (the given one, or the oldest open evolution:ready
// issue), checks it was filed by triage, and writes only its structured fields to artifacts/evolution/issue.json.
const root = join(import.meta.dirname, "..");

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(""));
}

function candidate(): GhIssue | undefined {
  const wanted = process.argv[2];
  if (wanted !== undefined && wanted !== "") {
    const number = issueNumberArg(wanted, `usage: pnpm evolution:pick-issue [issue number], not ${wanted}`);
    return JSON.parse(gh(root, ["issue", "view", String(number), "--json", ISSUE_FIELDS])) as GhIssue;
  }
  const ready = JSON.parse(gh(root, ["issue", "list", "--state", "open", "--label", "evolution:ready", "--limit", "100", "--json", ISSUE_FIELDS])) as GhIssue[];
  return ready.sort((a, b) => a.number - b.number)[0];
}

function main(): void {
  const found = candidate();
  if (found === undefined) {
    process.stdout.write("pick-issue: no open evolution:ready issue\n");
    output({ found: "false" });
    return;
  }
  const result = buildableIssue(found, { requireReady: true });
  if ("problem" in result) {
    process.stdout.write(`pick-issue: not building #${String(found.number)}: ${result.problem}\n`);
    output({ found: "false" });
    return;
  }
  const dir = join(root, "artifacts", "evolution");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "issue.json"), renderIssueJson(result.issue));
  const branch = branchName(found.number, result.issue.title);
  process.stdout.write(`pick-issue: building #${String(found.number)} on ${branch}\n`);
  output({ found: "true", number: String(found.number), branch });
}

main();
