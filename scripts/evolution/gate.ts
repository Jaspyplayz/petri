import type { EvolutionConfig } from "./config";
import { overBudget, type Totals } from "./usage";

export const gatedWorkflows = ["triage", "build", "verify", "automerge", "postmortem"] as const;

export type GatedWorkflow = (typeof gatedWorkflows)[number];

export type GateInput = {
  readonly workflow: GatedWorkflow;
  readonly enabled: string | undefined;
  readonly paused: string | undefined;
  readonly now: Date;
  readonly config: EvolutionConfig;
  readonly openEvolutionPRs: number;
  readonly mergesToday: number;
  // The last 7 days of agent runs; only triage and build read it, since they start new work.
  readonly weekUsage: Totals | undefined;
};

export function readsBudget(workflow: GatedWorkflow): boolean {
  return workflow === "triage" || workflow === "build";
}

export type GateResult = { readonly open: boolean; readonly reason: string };

// gh arguments that list the evolution PRs merged today (UTC). maxMergesPerDay counts these.
export function mergedTodayArgs(now: Date): string[] {
  return ["pr", "list", "--state", "merged", "--label", "evolution", "--search", `merged:>=${now.toISOString().slice(0, 10)}`, "--json", "number"];
}

// undefined: not paused. null: paused until a human resumes. A date: paused until then.
export function pauseState(paused: string | undefined, now: Date): { readonly paused: boolean; readonly reason: string } {
  if (paused === undefined) return { paused: false, reason: "not paused" };
  let until: unknown;
  try {
    until = (JSON.parse(paused) as { until?: unknown }).until;
  } catch {
    return { paused: true, reason: ".evolution/PAUSED isn't valid JSON, so the loop stays paused" };
  }
  if (until === null) return { paused: true, reason: "paused until a human resumes it (.evolution/PAUSED has until: null)" };
  const timestamp = typeof until === "string" ? Date.parse(until) : Number.NaN;
  if (Number.isNaN(timestamp)) return { paused: true, reason: ".evolution/PAUSED has no readable until, so the loop stays paused" };
  if (timestamp > now.getTime()) return { paused: true, reason: `paused until ${new Date(timestamp).toISOString()}` };
  return { paused: false, reason: `the pause ended at ${new Date(timestamp).toISOString()}` };
}

// The postmortem answers a guardian revert, which also pauses the loop, so only the kill switch stops it. It opens a
// PR a human merges and starts no new work.
export function gate(input: GateInput): GateResult {
  if (input.enabled !== "true") return { open: false, reason: 'the repo variable EVOLUTION_ENABLED isn\'t "true"' };
  if (input.workflow === "postmortem") return { open: true, reason: "enabled (a postmortem runs while the loop is paused)" };
  const pause = pauseState(input.paused, input.now);
  if (pause.paused) return { open: false, reason: pause.reason };
  const { config } = input;
  if (readsBudget(input.workflow)) {
    if (!input.weekUsage) return { open: false, reason: "the weekly agent usage wasn't read, so the budget can't be checked" };
    const over = overBudget(input.weekUsage, config.weeklyBudget);
    if (over) return { open: false, reason: over };
  }
  if (input.workflow === "triage" && config.maxIssuesPerTriage === 0) return { open: false, reason: "maxIssuesPerTriage is 0" };
  if (input.workflow === "build" && input.openEvolutionPRs >= config.maxOpenEvolutionPRs) {
    return { open: false, reason: `${String(input.openEvolutionPRs)} evolution PR(s) open; maxOpenEvolutionPRs is ${String(config.maxOpenEvolutionPRs)}` };
  }
  if (input.workflow === "automerge" && input.mergesToday >= config.maxMergesPerDay) {
    return { open: false, reason: `${String(input.mergesToday)} evolution PR(s) merged today (UTC); maxMergesPerDay is ${String(config.maxMergesPerDay)}` };
  }
  return { open: true, reason: `enabled, not paused and under every cap (trust level ${String(config.trustLevel)})` };
}
