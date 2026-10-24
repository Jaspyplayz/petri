import { join } from "node:path";
import { readEvolutionConfig } from "./evolution/config";
import { loopSupabase } from "./evolution/supabase";
import { AGENT_STEPS, parseAgentUsage, runStatus, WORKFLOW_OF_STEP, type AgentStep } from "./evolution/usage";

// pnpm evolution:record-run <triage|builder|planner|judge> records one agent run in agent_runs. It runs main's code in
// a job that never ran the agent's or the PR's code. Env: RESULT (the agent step's or job's result), USAGE (the JSON
// the workflow's jq step took from the action's log; may be empty), ISSUE and PR (optional), and the Supabase pair.
const root = join(import.meta.dirname, "..");

function optionalNumber(name: string): number | null {
  const value = Number(process.env[name] ?? "");
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function main(): Promise<void> {
  const step = process.argv[2];
  if (!AGENT_STEPS.some((name) => name === step)) throw new Error(`usage: pnpm evolution:record-run <${AGENT_STEPS.join("|")}>`);
  const agentStep = step as AgentStep;
  const workflow = WORKFLOW_OF_STEP[agentStep];
  const result = process.env.RESULT ?? "";
  const usage = parseAgentUsage(process.env.USAGE);
  const status = runStatus(result, usage);
  if (!status) {
    process.stdout.write(`record-run: the ${agentStep} agent didn't run (${result}); nothing to record\n`);
    return;
  }
  const runId = optionalNumber("GITHUB_RUN_ID");
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY;
  const finishedAt = new Date();
  const { error } = await loopSupabase()
    .from("agent_runs")
    .insert({
      workflow,
      gh_run_id: runId,
      gh_run_url: runId && repo ? `${server}/${repo}/actions/runs/${String(runId)}` : null,
      issue_number: optionalNumber("ISSUE"),
      pr_number: optionalNumber("PR"),
      model: readEvolutionConfig(root).models[workflow],
      status,
      turns: usage?.turns ?? null,
      duration_ms: usage?.durationMs ?? null,
      started_at: new Date(finishedAt.getTime() - (usage?.durationMs ?? 0)).toISOString(),
      finished_at: finishedAt.toISOString(),
      details: { step: agentStep, result, costUsd: usage?.costUsd ?? null, subtype: usage?.subtype ?? null },
    });
  if (error) throw new Error(`recording the ${agentStep} run failed: ${error.message}`);
  const numbers = usage ? `${String(usage.turns)} turns, ${(usage.durationMs / 60_000).toFixed(1)} min` : "no usage reported";
  process.stdout.write(`record-run: ${workflow}/${agentStep} ${status} (${numbers})\n`);
}

await main();
