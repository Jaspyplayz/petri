import type { EvolutionConfig } from "./config";
import type { Deployed, SentryNumbers, Verdict } from "./guardian";

// What one guardian check found. The check step writes it as JSON for the steps after it in the same job.
export type Incident = {
  readonly checkedAt: string;
  readonly serving: Deployed;
  readonly previous: Deployed | undefined;
  readonly currentWindow: { readonly start: string; readonly end: string };
  readonly numbers: SentryNumbers;
  readonly verdict: Verdict;
  readonly culprit: { readonly sha: string; readonly pr: { readonly number: number; readonly title: string; readonly url: string } } | undefined;
  readonly runUrl: string;
};

export type Outcome = {
  readonly rollback: "done" | "failed" | "skipped";
  readonly revert: { readonly url: string } | { readonly problem: string } | undefined;
  readonly pauseUntil: string | undefined;
  readonly trust: { readonly from: number; readonly to: number } | undefined;
};

function short(sha: string): string {
  return `\`${sha.slice(0, 7)}\``;
}

export function incidentSummary(incident: Incident, sentry: EvolutionConfig["sentry"]): string {
  const { serving, previous, numbers, verdict, culprit } = incident;
  const baseline =
    previous === undefined
      ? "there's no previous production deployment to compare with"
      : `the previous release (${short(previous.sha)}) had ${String(numbers.baselineErrors)} in its last ${String(sentry.windowMinutes)} min, so about ${verdict.expected.toFixed(1)} were expected`;
  const unhandled = numbers.newUnhandled.map(({ issue, events }) => `${issue} (${String(events)} events)`).join(", ");
  const rules = `at least ${String(sentry.minEvents)} errors and ${String(sentry.spikeMultiplier)}× the previous release, or a new unhandled error with at least ${String(sentry.minEvents)} events`;
  return [
    `- **Production:** ${serving.url ?? serving.id} (commit ${short(serving.sha)}), live since ${new Date(serving.liveAt).toISOString()}`,
    `- **Errors** (Sentry, environment production): ${String(numbers.currentErrors)} in the last ${numbers.currentMinutes.toFixed(0)} min; ${baseline}`,
    `- **New unhandled errors:** ${unhandled === "" ? "none" : unhandled}`,
    `- **Verdict:** ${verdict.spike ? `spike: ${verdict.reasons.join("; ")}` : `no spike (a spike is ${rules})`}`,
    `- **Evolution change in this deployment:** ${culprit === undefined ? "none (no evolution merge went live with it)" : `#${String(culprit.pr.number)} ${culprit.pr.title} (${short(culprit.sha)})`}`,
    `- **Run:** ${incident.runUrl}`,
  ].join("\n");
}

export function revertTitle(title: string): string {
  return `Revert "${title}"`.slice(0, 256);
}

export function revertPrBody(incident: Incident, summary: string, outcome: Pick<Outcome, "pauseUntil" | "trust">): string {
  const culprit = incident.culprit;
  if (culprit === undefined) throw new Error("a revert PR needs the change it reverts");
  const pr = `#${String(culprit.pr.number)}`;
  const target = incident.previous === undefined ? "the previous deployment" : short(incident.previous.sha);
  return [
    "## Why",
    "",
    `The guardian saw an error spike in production after ${pr} went live, and rolled production back to ${target}. This reverts ${pr} so main matches what production serves again.`,
    "",
    summary,
    "",
    "## What changed",
    "",
    `- Reverts ${pr} (${short(culprit.sha)}).`,
    outcome.pauseUntil === undefined
      ? "- `.evolution/PAUSED` stays as it is: the loop was already paused at least as long."
      : `- \`.evolution/PAUSED\`: the loop pauses until ${outcome.pauseUntil}.`,
    outcome.trust === undefined
      ? "- `.evolution/config.json` stays as it is: trustLevel is already 0."
      : `- \`.evolution/config.json\`: trustLevel ${String(outcome.trust.from)} → ${String(outcome.trust.to)}.`,
    "",
    "## Feature(s) touched",
    "",
    `The ones ${pr} touched.`,
    "",
    "## Verification report + screenshots",
    "",
    "The evidence is the spike above. CI runs on this PR like any other, and it merges itself once the required checks pass.",
    "",
    "## Risk",
    "",
    `It puts back the code that was live before ${pr}. Anything ${pr} wrote to the database stays.`,
    "",
    "## Rollback",
    "",
    `Revert this PR to bring ${pr} back, once the spike's cause is understood and fixed.`,
  ].join("\n");
}

export function notifyIssue(incident: Incident, summary: string, outcome: Outcome): { readonly title: string; readonly body: string } {
  const culprit = incident.culprit;
  const title =
    culprit === undefined
      ? `Guardian: error spike in production (${incident.serving.sha.slice(0, 7)})`
      : `Guardian: production rolled back after #${String(culprit.pr.number)}`;
  const rollback = {
    done: `Rolled production back to ${incident.previous === undefined ? "the previous deployment" : `${incident.previous.url ?? incident.previous.id} (${short(incident.previous.sha)})`}.`,
    failed: "**The rollback failed.** Production still serves the deployment with the spike; roll it back by hand (Vercel → the project → Instant Rollback).",
    skipped: "Didn't roll back: there's no previous production deployment to go back to.",
  }[outcome.rollback];
  const revert =
    outcome.revert === undefined
      ? "No revert PR: the change that went live isn't an evolution PR, so a human decides what to do with it."
      : "url" in outcome.revert
        ? `Opened ${outcome.revert.url}, which merges itself once its checks pass. It also ${outcome.pauseUntil === undefined ? "leaves the existing pause as it is" : `pauses the loop until ${outcome.pauseUntil}`} and ${outcome.trust === undefined ? "leaves trustLevel at 0" : `lowers trustLevel from ${String(outcome.trust.from)} to ${String(outcome.trust.to)}`}.`
        : `**No revert PR:** ${outcome.revert.problem}`;
  const todo = [
    "- After a rollback, Vercel stops putting new deployments live until one is promoted. Once the revert has merged and deployed, promote its deployment: Vercel → Deployments → the revert's deployment → Promote (or `vercel promote <url>`). Until then production stays on the rolled-back deployment, which is safe.",
    culprit === undefined ? "- Find the cause of the spike in Sentry; the guardian didn't revert anything." : `- Run \`/postmortem #${String(culprit.pr.number)}\` to find out why the change got through and add a check that would have caught it.`,
    "- The pause ends on its own at the time in `.evolution/PAUSED`. Raising trustLevel again is a human decision.",
  ];
  return {
    title,
    body: ["## What the guardian saw", "", summary, "", "## What it did", "", `- ${rollback}`, `- ${revert}`, "", "## What you need to do", "", ...todo].join("\n"),
  };
}
