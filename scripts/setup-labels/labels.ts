import type { RiskLevel } from "../../src/shared/lib/feature-manifest";
import { GUARDIAN_ISSUE_LABEL } from "../evolution/guardian";
import { POSTMORTEM_LABEL } from "../evolution/postmortem";
import { RISK_ORDER } from "../evolution/triage-output";
import { EVOLUTION_LABEL, NEEDS_HUMAN_LABEL, REVERT_LABEL } from "../trust-report/ladder";

export type LabelSpec = { readonly name: string; readonly color: string; readonly description: string };

const risk: Record<RiskLevel, Omit<LabelSpec, "name">> = {
  low: { color: "C2E0C6", description: "riskLevel low (trust ladder)" },
  medium: { color: "FBCA04", description: "riskLevel medium (trust ladder)" },
  high: { color: "D93F0B", description: "riskLevel high: a human merges" },
};

// Every label the loop and the guardrails read or write. The workflows fail when one is missing (the first dry-run
// triage did), so `pnpm setup:labels --apply` creates them all before the loop runs.
export const LOOP_LABELS: readonly LabelSpec[] = [
  { name: EVOLUTION_LABEL, color: "1D76DB", description: "Agent PR from the evolution loop (guardrails apply)" },
  { name: "evolution:ready", color: "0E8A16", description: "Triaged and ready for the build agent" },
  { name: "evolution:stuck", color: "B60205", description: "Verification failed three times; an agent stopped and needs a human" },
  { name: REVERT_LABEL, color: "5319E7", description: "A guardian revert; trust-report counts it" },
  { name: GUARDIAN_ISSUE_LABEL, color: "B60205", description: "The guardian rolled production back; a human follows up" },
  { name: NEEDS_HUMAN_LABEL, color: "B60205", description: "Automerge refused it or won't take it; a human decides" },
  { name: POSTMORTEM_LABEL, color: "5319E7", description: "A postmortem PR from evolution-postmortem; a human merges it" },
  ...RISK_ORDER.map((level) => ({ name: `risk:${level}`, ...risk[level] })),
  { name: "protected-ok", color: "B60205", description: "Human-only: maintainer approves an agent PR touching protected paths" },
  { name: "size-ok", color: "FBCA04", description: "Human-only: maintainer approves an agent PR over the size limit" },
];

export function labelCommand(label: LabelSpec): readonly string[] {
  return ["label", "create", label.name, "--color", label.color, "--description", label.description, "--force"];
}
