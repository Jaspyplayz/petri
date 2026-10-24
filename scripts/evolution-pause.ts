// pnpm evolution:pause   turns the loop off now: EVOLUTION_ENABLED=false, then cancels queued and running agent runs.
// pnpm evolution:resume  turns it back on, unless an active .evolution/PAUSED is on main (only a human PR removes it).
// Flipping EVOLUTION_ENABLED in the GitHub app does the first half of a pause from a phone; every gate checks it.
import { spawnSync } from "node:child_process";
import { STOPPABLE_WORKFLOWS, resumeBlock, runsToCancel, type WorkflowRun } from "./evolution/pause";

function gh(args: readonly string[], allowFailure = false): string {
  const result = spawnSync("gh", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`gh ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  }
  return result.status === 0 ? result.stdout : "";
}

function pausedOnMain(): string | undefined {
  const content = gh(["api", "repos/{owner}/{repo}/contents/.evolution/PAUSED", "-H", "Accept: application/vnd.github.raw"], true);
  return content === "" ? undefined : content;
}

function pause(): void {
  gh(["variable", "set", "EVOLUTION_ENABLED", "--body", "false"]);
  process.stdout.write("evolution: EVOLUTION_ENABLED=false. Every gate is closed from now on.\n");
  const runs = STOPPABLE_WORKFLOWS.flatMap(
    (workflow) => JSON.parse(gh(["run", "list", "--workflow", workflow, "--limit", "20", "--json", "databaseId,status,workflowName"])) as WorkflowRun[],
  );
  const ids = runsToCancel(runs);
  for (const id of ids) gh(["run", "cancel", String(id)], true);
  process.stdout.write(ids.length > 0 ? `evolution: cancelled ${String(ids.length)} run(s): ${ids.join(", ")}\n` : "evolution: no agent run was queued or running.\n");
}

function resume(): void {
  const block = resumeBlock(pausedOnMain(), new Date());
  if (block) {
    process.stderr.write(`evolution: not resuming. ${block}\n`);
    process.exit(1);
  }
  gh(["variable", "set", "EVOLUTION_ENABLED", "--body", "true"]);
  process.stdout.write("evolution: EVOLUTION_ENABLED=true. The next triage or build run passes the gate again.\n");
}

const command = process.argv[2];
if (command === "pause") pause();
else if (command === "resume") resume();
else throw new Error("usage: tsx scripts/evolution-pause.ts <pause|resume>");
