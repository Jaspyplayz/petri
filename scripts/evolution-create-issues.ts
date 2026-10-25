import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readEvolutionConfig } from "./evolution/config";
import { featureRisks } from "./evolution/feature-risks";
import { loopSupabase } from "./evolution/supabase";
import type { TriageInput } from "./evolution/triage-input";
import { planIssues, renderIssueBody, triageOutputSchema } from "./evolution/triage-output";

// pnpm evolution:create-issues [--dry-run] turns the triage agent's JSON (artifacts/evolution/triage-output.json)
// into GitHub issues and marks the feedback triaged or rejected. GH_TOKEN must be a token whose events trigger
// workflows (the evolution app's), so the evolution:ready label starts the build.
const root = join(import.meta.dirname, "..");
const dir = join(root, "artifacts", "evolution");
const dryRun = process.argv.includes("--dry-run");

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(dir, name), "utf8"));
}

function gh(args: readonly string[]): string {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`gh ${args[0] ?? ""} ${args[1] ?? ""} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const parsed = triageOutputSchema.safeParse(readJson("triage-output.json"));
  if (!parsed.success) throw new Error(`the triage output doesn't match the schema: ${z.prettifyError(parsed.error)}`);
  const input = readJson("triage-input.json") as TriageInput;
  const config = readEvolutionConfig(root);
  const plan = planIssues(parsed.data, {
    candidateIds: new Set(input.candidates.map((candidate) => candidate.id)),
    featureRisk: featureRisks(root),
    maxIssues: config.maxIssuesPerTriage,
  });
  for (const problem of plan.problems) process.stdout.write(`! ${problem}\n`);
  process.stdout.write(`create-issues: ${String(plan.issues.length)} issue(s), ${String(plan.rejected.length)} rejection(s)${dryRun ? " (dry run)" : ""}\n`);
  if (dryRun) {
    for (const issue of plan.issues) process.stdout.write(`\n# ${issue.title}\n${renderIssueBody(issue)}`);
    for (const rejection of plan.rejected) process.stdout.write(`rejected ${rejection.feedbackId}: ${rejection.reason} (${rejection.note})\n`);
    return;
  }

  const supabase = loopSupabase();
  for (const issue of plan.issues) {
    const url = gh(["issue", "create", "--title", issue.title, "--body", renderIssueBody(issue), "--label", `evolution,evolution:ready,risk:${issue.riskLevel}`]);
    const number = Number(/\/issues\/(\d+)$/.exec(url)?.[1]);
    if (!Number.isInteger(number)) throw new Error(`gh issue create didn't return an issue URL: ${url}`);
    const update = await supabase.from("feedback").update({ status: "triaged", issue_number: number, issue_url: url }).in("id", [...issue.feedbackIds]);
    if (update.error) throw new Error(`marking feedback triaged for #${String(number)} failed: ${update.error.message}`);
    process.stdout.write(`created #${String(number)} ${issue.title} (${String(issue.feedbackIds.length)} feedback)\n`);
  }
  if (plan.rejected.length > 0) {
    const update = await supabase.from("feedback").update({ status: "rejected" }).in("id", plan.rejected.map((rejection) => rejection.feedbackId));
    if (update.error) throw new Error(`marking feedback rejected failed: ${update.error.message}`);
  }
}

await main();
