import { z } from "zod";
import type { EvolutionConfig } from "./config";

// Agent usage (Phase 8): every agent run lands in agent_runs with its turns and runtime, the gate closes triage and
// build once the last 7 days pass .evolution/config.json's weeklyBudget, and a weekly issue shows the totals.
export const BUDGET_WINDOW_DAYS = 7;
export const BUDGETED_WORKFLOWS = ["triage", "build", "verify"] as const;
export type BudgetedWorkflow = (typeof BUDGETED_WORKFLOWS)[number];
export const AGENT_STEPS = ["triage", "builder", "planner", "judge"] as const;
export type AgentStep = (typeof AGENT_STEPS)[number];
export const WORKFLOW_OF_STEP: Readonly<Record<AgentStep, BudgetedWorkflow>> = { triage: "triage", builder: "build", planner: "verify", judge: "verify" };

// What `jq` takes from the action's execution log (its final `result` message). In the build workflow the agent's job
// could rewrite that log, so this is a report, not proof: the bounds keep a bad value out of the table, and
// --max-turns and timeout-minutes still cap every run whatever it reports.
const agentUsageSchema = z
  .object({
    turns: z.number().int().min(0).max(1000),
    durationMs: z.number().int().min(0).max(6 * 3_600_000),
    costUsd: z.number().min(0).max(1000).nullable(),
    isError: z.boolean(),
    subtype: z.string().max(64),
  })
  .strict();

export type AgentUsage = z.infer<typeof agentUsageSchema>;

export function parseAgentUsage(text: string | undefined): AgentUsage | undefined {
  if (!text?.trim()) return undefined;
  try {
    const result = agentUsageSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export type RunStatus = "pass" | "fail" | "error";

// result is the agent step's or job's result. undefined means there's nothing to record: the agent never started.
export function runStatus(result: string, usage: AgentUsage | undefined): RunStatus | undefined {
  if (result === "skipped" && !usage) return undefined;
  if (!usage || result === "cancelled") return "error";
  return usage.isError || result === "failure" ? "fail" : "pass";
}

export type AgentRunRow = {
  readonly workflow: string;
  readonly status: string;
  readonly turns: number | null;
  readonly duration_ms: number | null;
  readonly details: unknown;
};

export type Totals = { readonly runs: number; readonly failed: number; readonly turns: number; readonly agentMinutes: number; readonly costUsd: number };

const ZERO: Totals = { runs: 0, failed: 0, turns: 0, agentMinutes: 0, costUsd: 0 };

function costOf(details: unknown): number {
  const cost = typeof details === "object" && details !== null ? (details as { costUsd?: unknown }).costUsd : undefined;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : 0;
}

function add(totals: Totals, row: AgentRunRow): Totals {
  return {
    runs: totals.runs + 1,
    failed: totals.failed + (row.status === "pass" ? 0 : 1),
    turns: totals.turns + (row.turns ?? 0),
    agentMinutes: totals.agentMinutes + (row.duration_ms ?? 0) / 60_000,
    costUsd: totals.costUsd + costOf(row.details),
  };
}

export function isBudgeted(workflow: string): workflow is BudgetedWorkflow {
  return BUDGETED_WORKFLOWS.some((name) => name === workflow);
}

export function budgetTotals(rows: readonly AgentRunRow[]): Totals {
  return rows.filter((row) => isBudgeted(row.workflow)).reduce(add, ZERO);
}

export function totalsByWorkflow(rows: readonly AgentRunRow[]): Map<string, Totals> {
  const byWorkflow = new Map<string, Totals>();
  for (const row of rows) byWorkflow.set(row.workflow, add(byWorkflow.get(row.workflow) ?? ZERO, row));
  return byWorkflow;
}

export function overBudget(totals: Totals, budget: EvolutionConfig["weeklyBudget"]): string | undefined {
  const over = [
    totals.turns >= budget.turns ? `${String(totals.turns)} turns (budget ${String(budget.turns)})` : undefined,
    totals.agentMinutes >= budget.agentMinutes ? `${String(Math.round(totals.agentMinutes))} agent minutes (budget ${String(budget.agentMinutes)})` : undefined,
  ].filter((part) => part !== undefined);
  return over.length === 0 ? undefined : `over the weekly budget: the agents used ${over.join(" and ")} in the last ${String(BUDGET_WINDOW_DAYS)} days`;
}

export function windowStart(now: Date): Date {
  return new Date(now.getTime() - BUDGET_WINDOW_DAYS * 86_400_000);
}

function row(name: string, totals: Totals): string {
  return `| ${name} | ${String(totals.runs)} | ${String(totals.failed)} | ${String(totals.turns)} | ${totals.agentMinutes.toFixed(1)} | ${totals.costUsd.toFixed(2)} |`;
}

function share(used: number, budget: number): string {
  return `${String(Math.round(used))} of ${String(budget)} (${String(Math.round((used / budget) * 100))}%)`;
}

export function renderWeeklySummary(rows: readonly AgentRunRow[], budget: EvolutionConfig["weeklyBudget"], now: Date): string {
  const from = windowStart(now).toISOString().slice(0, 16).replace("T", " ");
  const to = now.toISOString().slice(0, 16).replace("T", " ");
  const byWorkflow = [...totalsByWorkflow(rows)].sort(([a], [b]) => a.localeCompare(b));
  const totals = budgetTotals(rows);
  const over = overBudget(totals, budget);
  return [
    `## Agent runs, ${from} to ${to} UTC`,
    "",
    "| Workflow | Runs | Failed or errored | Turns | Agent minutes | API-equivalent $ |",
    "|---|---|---|---|---|---|",
    ...(byWorkflow.length === 0 ? ["| (none) | 0 | 0 | 0 | 0.0 | 0.00 |"] : byWorkflow.map(([name, value]) => row(name, value))),
    row(`**Budgeted (${BUDGETED_WORKFLOWS.join(", ")})**`, totals),
    "",
    `**Budget** (rolling ${String(BUDGET_WINDOW_DAYS)} days, \`weeklyBudget\` in \`.evolution/config.json\`): turns ${share(totals.turns, budget.turns)}, agent minutes ${share(totals.agentMinutes, budget.agentMinutes)}.`,
    "",
    over
      ? "**Over budget.** The triage and build gates stay closed until older runs leave the window or a human raises `weeklyBudget`."
      : "Under budget. The gates stay open.",
    "",
    "API-equivalent $ is what the same tokens would cost on the API. The loop runs on the Claude Max plan, so it isn't billed; it shows how much of the plan's limits the loop takes. `docs/costs.md` explains the numbers.",
  ].join("\n");
}
