import { pauseState } from "./gate";

// The workflows that run agents or merge. Pausing cancels their queued and running runs, so a pause stops work that
// already passed its gate. Post-merge and pr-closed only record what already happened, so they're left to finish.
export const STOPPABLE_WORKFLOWS = [
  "evolution-triage.yml",
  "evolution-build.yml",
  "evolution-verify.yml",
  "evolution-automerge.yml",
] as const;

export type WorkflowRun = { readonly databaseId: number; readonly status: string; readonly workflowName?: string };

export function runsToCancel(runs: readonly WorkflowRun[]): number[] {
  const live = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
  return [...new Set(runs.filter((run) => live.has(run.status)).map((run) => run.databaseId))].sort((a, b) => a - b);
}

// What stops `pnpm evolution:resume`: an active .evolution/PAUSED on main. Only a human PR removes it, so the guardian's
// pause can't be undone by flipping the variable.
export function resumeBlock(pausedOnMain: string | undefined, now: Date): string | undefined {
  const state = pauseState(pausedOnMain, now);
  return state.paused ? `${state.reason}. Remove .evolution/PAUSED from main in a human PR, then resume.` : undefined;
}
