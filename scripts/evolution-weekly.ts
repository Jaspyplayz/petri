import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { readEvolutionConfig } from "./evolution/config";
import { loopSupabase } from "./evolution/supabase";
import { renderWeeklySummary, windowStart } from "./evolution/usage";

// pnpm evolution:weekly prints the last 7 days of agent_runs against the weekly budget. With --issue it also opens an
// issue labelled evolution:weekly. It only reports: the gate is what closes triage and build when over budget.
const root = join(import.meta.dirname, "..");
const LABEL = "evolution:weekly";

function gh(args: readonly string[], input?: string): string {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", input, windowsHide: true });
  if (result.status !== 0) throw new Error(`gh ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const now = new Date();
  const { data, error } = await loopSupabase()
    .from("agent_runs")
    .select("workflow, status, turns, duration_ms, details")
    .gte("started_at", windowStart(now).toISOString());
  if (error) throw new Error(`reading agent_runs failed: ${error.message}`);
  const body = renderWeeklySummary(data, readEvolutionConfig(root).weeklyBudget, now);
  process.stdout.write(`${body}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${body}\n`);
  if (!process.argv.includes("--issue")) return;
  gh(["label", "create", LABEL, "--color", "C5DEF5", "--description", "Weekly agent usage summary", "--force"]);
  const url = gh(["issue", "create", "--title", `Weekly agent usage, week to ${now.toISOString().slice(0, 10)}`, "--label", LABEL, "--body-file", "-"], body);
  process.stdout.write(`weekly: opened ${url}\n`);
}

await main();
