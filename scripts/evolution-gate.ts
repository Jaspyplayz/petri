import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PAUSED_PATH, readEvolutionConfig } from "./evolution/config";
import { gate, gatedWorkflows, mergedTodayArgs, readsBudget, type GatedWorkflow } from "./evolution/gate";
import { loopSupabase } from "./evolution/supabase";
import { budgetTotals, windowStart, type Totals } from "./evolution/usage";

// pnpm evolution:gate <triage|build|verify|automerge> writes open=true|false and reason to $GITHUB_OUTPUT.
// A closed gate isn't a failure: the workflow skips its agent steps and exits green. Triage and build also read the
// last 7 days of agent_runs (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY); if that read fails, the step
// fails rather than run without a budget.
const root = join(import.meta.dirname, "..");

function gh(args: readonly string[]): unknown {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`gh ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return JSON.parse(result.stdout);
}

function countOf(args: readonly string[]): number {
  const items = gh(args);
  return Array.isArray(items) ? items.length : 0;
}

async function weekUsage(now: Date): Promise<Totals> {
  const { data, error } = await loopSupabase()
    .from("agent_runs")
    .select("workflow, status, turns, duration_ms, details")
    .gte("started_at", windowStart(now).toISOString());
  if (error) throw new Error(`reading agent_runs failed: ${error.message}`);
  return budgetTotals(data);
}

async function main(): Promise<void> {
  const workflow = process.argv[2];
  if (!gatedWorkflows.some((name) => name === workflow)) throw new Error(`usage: pnpm evolution:gate <${gatedWorkflows.join("|")}>`);
  const name = workflow as GatedWorkflow;
  const now = new Date();
  const pausedPath = join(root, PAUSED_PATH);
  const result = gate({
    workflow: name,
    enabled: process.env.EVOLUTION_ENABLED,
    paused: existsSync(pausedPath) ? readFileSync(pausedPath, "utf8") : undefined,
    now,
    config: readEvolutionConfig(root),
    openEvolutionPRs: name === "build" ? countOf(["pr", "list", "--state", "open", "--label", "evolution", "--json", "number"]) : 0,
    mergesToday: name === "automerge" ? countOf(mergedTodayArgs(now)) : 0,
    weekUsage: readsBudget(name) && process.env.EVOLUTION_ENABLED === "true" ? await weekUsage(now) : undefined,
  });
  const line = `evolution gate (${name}): ${result.open ? "open" : "closed"}: ${result.reason}`;
  process.stdout.write(`${line}\n`);
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `open=${String(result.open)}\nreason=${result.reason.replace(/\n/g, " ")}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `### ${line}\n`);
}

await main();
