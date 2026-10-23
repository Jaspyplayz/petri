import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { branchName, type BuiltIssue } from "./evolution/build";
import { issueFromBody } from "./evolution/triage-output";

// pnpm evolution:pick-issue [number] picks the issue to build (the given one, or the oldest open evolution:ready
// issue), checks it was filed by triage, and writes only its structured fields to artifacts/evolution/issue.json.
const root = join(import.meta.dirname, "..");

type GhIssue = { number: number; title: string; body: string; url: string; state: string; labels: { name: string }[] };

function gh(args: readonly string[]): string {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`gh ${args[0] ?? ""} ${args[1] ?? ""} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout;
}

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(""));
}

function candidate(): GhIssue | undefined {
  const fields = "number,title,body,url,state,labels";
  const wanted = process.argv[2];
  if (wanted !== undefined && wanted !== "") {
    if (!/^\d+$/.test(wanted)) throw new Error(`usage: pnpm evolution:pick-issue [issue number], not ${wanted}`);
    return JSON.parse(gh(["issue", "view", wanted, "--json", fields])) as GhIssue;
  }
  const ready = JSON.parse(gh(["issue", "list", "--state", "open", "--label", "evolution:ready", "--limit", "100", "--json", fields])) as GhIssue[];
  return ready.sort((a, b) => a.number - b.number)[0];
}

function main(): void {
  const issue = candidate();
  if (issue === undefined) {
    process.stdout.write("pick-issue: no open evolution:ready issue\n");
    output({ found: "false" });
    return;
  }
  const labels = issue.labels.map((label) => label.name);
  const fields = issueFromBody(issue.body);
  const problem =
    issue.state !== "OPEN"
      ? "it isn't open"
      : !labels.includes("evolution") || !labels.includes("evolution:ready")
        ? "it doesn't have both the evolution and evolution:ready labels"
        : fields === undefined
          ? "its body has no valid evolution-issue data comment (only triage files buildable issues)"
          : undefined;
  if (problem !== undefined || fields === undefined) {
    process.stdout.write(`pick-issue: not building #${String(issue.number)}: ${problem ?? "unknown"}\n`);
    output({ found: "false" });
    return;
  }
  const built: BuiltIssue = { ...fields, number: issue.number, url: issue.url };
  const dir = join(root, "artifacts", "evolution");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "issue.json"), `${JSON.stringify(built, null, 2)}\n`);
  const branch = branchName(issue.number, fields.title);
  process.stdout.write(`pick-issue: building #${String(issue.number)} on ${branch}\n`);
  output({ found: "true", number: String(issue.number), branch });
}

main();
