import type { EvolutionConfig } from "./config";
import { incidentMarker, type Deployed, type SentryNumbers, type Verdict } from "./guardian";

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

// What the pause PR changes: undefined where the file stays as it is.
export type Changes = { readonly pauseUntil: string | undefined; readonly trust: { readonly from: number; readonly to: number } | undefined };

export type Opened = { readonly url: string } | { readonly problem: string };

export type Outcome = {
  readonly rollback: "done" | "failed" | "skipped";
  // Both are undefined when no evolution change went live; the pause is "unchanged" when there was nothing to change.
  readonly revert: Opened | undefined;
  readonly pause: Opened | "unchanged" | undefined;
  readonly changes: Changes | undefined;
};

function short(sha: string): string {
  return `\`${sha.slice(0, 7)}\``;
}

export function incidentSummary(incident: Incident, sentry: EvolutionConfig["sentry"]): string {
  const { serving, previous, numbers, verdict, culprit } = incident;
  const baseline =
    previous === undefined
      ? "there's no previous production deployment to compare with, so only new unhandled errors count"
      : verdict.expected === undefined
        ? `the previous release (${short(previous.sha)}) was live only ${numbers.baselineMinutes.toFixed(0)} min before this one, too short to compare a rate with, so only new unhandled errors count`
        : `the previous release (${short(previous.sha)}) had ${String(numbers.baselineErrors)} in its last ${numbers.baselineMinutes.toFixed(0)} min live, so about ${verdict.expected.toFixed(1)} were expected`;
  const unhandled = numbers.newUnhandled.map(({ issue, events }) => `${issue} (${String(events)} events)`).join(", ");
  const rules = `at least ${String(sentry.minEvents)} errors and ${String(sentry.spikeMultiplier)}× the previous release's rate, or a new unhandled error with at least ${String(sentry.minEvents)} events`;
  return [
    `- **Production:** ${serving.url ?? serving.id} (commit ${short(serving.sha)}), live since ${new Date(serving.liveAt).toISOString()}`,
    `- **Errors** (Sentry, environment production): ${String(numbers.currentErrors)} in the last ${numbers.currentMinutes.toFixed(0)} min; ${baseline}`,
    `- **New unhandled errors:** ${unhandled === "" ? "none" : unhandled}`,
    `- **Verdict:** ${verdict.spike ? `spike: ${verdict.reasons.join("; ")}` : `no spike (a spike is ${rules})`}`,
    `- **Evolution change in this deployment:** ${culprit === undefined ? "none (no evolution merge went live with it)" : `#${String(culprit.pr.number)} ${culprit.pr.title} (${short(culprit.sha)})`}`,
    `- **Run:** ${incident.runUrl}`,
  ].join("\n");
}

function culpritOf(incident: Incident): NonNullable<Incident["culprit"]> {
  if (incident.culprit === undefined) throw new Error("the guardian's PRs need the evolution change that went live");
  return incident.culprit;
}

function previousName(incident: Incident): string {
  return incident.previous === undefined ? "the previous deployment" : short(incident.previous.sha);
}

export function revertTitle(title: string): string {
  return `Revert "${title}"`.slice(0, 256);
}

export function revertPrBody(incident: Incident, summary: string): string {
  const culprit = culpritOf(incident);
  const pr = `#${String(culprit.pr.number)}`;
  return [
    "## Why",
    "",
    `The guardian saw an error spike in production after ${pr} went live. It rolls production back to ${previousName(incident)} and reverts ${pr} here, so main matches what production serves. A separate guardian PR pauses the loop and lowers trust.`,
    "",
    summary,
    "",
    "## What changed",
    "",
    `- Reverts ${pr} (${short(culprit.sha)}).`,
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
    "",
    incidentMarker(incident.serving.id),
  ].join("\n");
}

export function pauseTitle(prNumber: number): string {
  return `chore(evolution): pause the loop and lower trust after #${String(prNumber)}`;
}

function pauseText(changes: Changes): string {
  const pause = changes.pauseUntil === undefined ? "leaves the existing, longer pause as it is" : `pauses the loop until ${changes.pauseUntil}`;
  const trust = changes.trust === undefined ? "leaves trustLevel at 0" : `lowers trustLevel from ${String(changes.trust.from)} to ${String(changes.trust.to)}`;
  return `${pause} and ${trust}`;
}

// The pause and the trust drop go in their own PR, so they land even when the revert can't (a conflict, a protected
// path in the reverted change, a failed push).
export function pausePrBody(incident: Incident, summary: string, changes: Changes): string {
  const pr = `#${String(culpritOf(incident).pr.number)}`;
  return [
    "## Why",
    "",
    `The guardian saw an error spike in production after ${pr} went live. An automatic revert pauses the loop for 24 hours and lowers the trust level by one (the trust ladder in CLAUDE.md). This PR does that on its own, so it lands even if the revert can't.`,
    "",
    summary,
    "",
    "## What changed",
    "",
    `- It ${pauseText(changes)}.`,
    "",
    "## Feature(s) touched",
    "",
    "None. `.evolution/` only.",
    "",
    "## Verification report + screenshots",
    "",
    "Guardrails allow an agent PR exactly these edits (a longer pause, a lower trustLevel), and the protected-paths check verifies it. It merges itself once the required checks pass.",
    "",
    "## Risk",
    "",
    "None for the app. Triage and build stop until the pause ends, and come back at the lower trust level.",
    "",
    "## Rollback",
    "",
    "Only a human shortens the pause or raises trustLevel again.",
    "",
    incidentMarker(incident.serving.id),
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
    failed: "**The rollback failed.** Production still serves the deployment with the spike; roll it back by hand (Vercel → the project → Instant Rollback). The guardian retries on its next run.",
    skipped: "Didn't roll back: there's no previous production deployment to go back to.",
  }[outcome.rollback];
  const did = [`- ${rollback}`];
  if (culprit === undefined) did.push("- No revert PR: the change that went live isn't an evolution PR, so a human decides what to do with it.");
  if (culprit !== undefined && outcome.revert !== undefined) {
    did.push(
      "url" in outcome.revert
        ? `- Opened ${outcome.revert.url} to revert #${String(culprit.pr.number)}. It merges itself once its checks pass.`
        : `- **No revert PR:** ${outcome.revert.problem}`,
    );
  }
  if (outcome.pause === "unchanged") did.push("- No pause PR: the loop is already paused for longer and trustLevel is already 0.");
  else if (outcome.pause !== undefined) {
    did.push(
      "url" in outcome.pause
        ? `- Opened ${outcome.pause.url}, which merges itself once its checks pass. It ${outcome.changes === undefined ? "pauses the loop and lowers trust" : pauseText(outcome.changes)}.`
        : `- **No pause PR:** ${outcome.pause.problem}`,
    );
  }
  const todo: string[] = [];
  if (outcome.rollback === "done") {
    todo.push(
      "- After a rollback, Vercel stops putting new deployments live until one is promoted. Once the revert has merged and deployed, promote its deployment: Vercel → Deployments → the revert's deployment → Promote (or `vercel promote <url>`). Until then production stays on the rolled-back deployment, which is safe.",
    );
  }
  todo.push(
    culprit === undefined ? "- Find the cause of the spike in Sentry; the guardian didn't revert anything." : `- Run \`/postmortem #${String(culprit.pr.number)}\` to find out why the change got through and add a check that would have caught it.`,
  );
  if (outcome.pause !== undefined && outcome.pause !== "unchanged" && "problem" in outcome.pause) {
    todo.push("- The loop isn't paused yet: merge the pause PR if there is one, or pause it by hand (`pnpm evolution:pause`) and lower trustLevel in `.evolution/config.json`.");
  } else if (outcome.pause !== undefined) {
    todo.push("- The pause ends on its own at the time in `.evolution/PAUSED`. Raising trustLevel again is a human decision.");
  }
  return {
    title,
    body: ["## What the guardian saw", "", summary, "", "## What it did", "", ...did, "", "## What you need to do", "", ...todo, "", incidentMarker(incident.serving.id)].join("\n"),
  };
}

// A later run found the same incident still live and retried the rollback, which worked this time.
export function retriedRollbackComment(incident: Incident): string {
  const target = incident.previous === undefined ? "the previous deployment" : `${incident.previous.url ?? incident.previous.id} (${short(incident.previous.sha)})`;
  return `The guardian retried the rollback (${incident.runUrl}): production serves ${target} again.`;
}
