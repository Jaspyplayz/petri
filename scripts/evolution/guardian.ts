import { z } from "zod";
import { NEEDS_HUMAN_LABEL, REVERT_LABEL } from "../trust-report/ladder";
import type { EvolutionConfig } from "./config";
import { pauseState } from "./gate";

// The guardian (evolution-guardian.yml) watches production. This file holds its pure parts: what Vercel and Sentry
// answered, the spike rule, and the files and text it writes. scripts/evolution-guardian.ts does the I/O.

export const GUARDIAN_BRANCH_PREFIX = "guardian/";
export const GUARDIAN_ISSUE_LABEL = "evolution:guardian";
export const PAUSE_HOURS = 24;
// A previous release live for less than this had too few errors to compare a rate with.
export const MIN_BASELINE_MINUTES = 15;
// Rates are compared only this many windows after a release went live. Later, the time of day differs too much from
// the baseline's, and only new unhandled errors count.
export const RATE_WINDOWS = 2;

const commitSha = z.string().regex(/^[0-9a-f]{40}$/);

// A deployment as GET /v7/deployments lists it, reduced to the fields the guardian reads. readySubstate is PROMOTED
// once a deployment has served production, and STAGED while it never has.
export const vercelDeploymentSchema = z.object({
  uid: z.string().min(1),
  url: z.string().nullish(),
  created: z.number(),
  ready: z.number().nullish(),
  state: z.string(),
  readySubstate: z.string().nullish(),
  target: z.string().nullish(),
  meta: z.object({ githubCommitSha: commitSha.optional() }).nullish(),
});
export const vercelDeploymentListSchema = z.object({ deployments: z.array(vercelDeploymentSchema) });
export type VercelDeployment = z.infer<typeof vercelDeploymentSchema>;

// GET /v4/aliases/{alias}: which deployment the production URL serves right now.
export const vercelAliasSchema = z.object({ deploymentId: z.string().min(1) });

// GET /v9/projects/{id}: the project's last promote or rollback, if it ever had one. jobStatus is succeeded, pending,
// in-progress, failed or skipped. fromDeploymentId is the deployment production served before it.
export const vercelProjectSchema = z.object({
  lastAliasRequest: z
    .object({ type: z.string(), fromDeploymentId: z.string().nullish(), toDeploymentId: z.string(), requestedAt: z.number(), jobStatus: z.string() })
    .nullish(),
});
export type AliasRequest = NonNullable<z.infer<typeof vercelProjectSchema>["lastAliasRequest"]>;

// GET /api/0/organizations/{org}/events/ (Sentry's errors dataset): one row per group.
export const sentryTableSchema = z.object({ data: z.array(z.record(z.string(), z.unknown())) });

export type Deployed = { readonly id: string; readonly url: string | undefined; readonly sha: string; readonly liveAt: number };

export type Production =
  | { readonly kind: "ok"; readonly serving: Deployed; readonly previous: Deployed | undefined }
  | { readonly kind: "held"; readonly reason: string };

// A deployment went live when it was ready, unless a promote or rollback put it live later.
function deployed(deployment: VercelDeployment, aliasRequest: AliasRequest | undefined): Deployed | undefined {
  const sha = deployment.meta?.githubCommitSha;
  if (sha === undefined) return undefined;
  const aliasedAt = aliasRequest?.toDeploymentId === deployment.uid ? aliasRequest.requestedAt : undefined;
  return { id: deployment.uid, url: deployment.url ?? undefined, sha, liveAt: aliasedAt ?? deployment.ready ?? deployment.created };
}

// The guardian judges production only while it serves the newest ready production deployment, and only when that
// deployment went live by being deployed. Anything else means a rollback or a promote chose what production serves,
// and a human watches it until the next deploy. The previous release is the newest older deployment that served
// production; deployments built while a rollback held the domain never did, so they're skipped. A promote or rollback
// that failed or was skipped changed nothing, and one requested after this release went live can't date the one before.
export function productionState(deployments: readonly VercelDeployment[], servingId: string, aliasRequest: AliasRequest | undefined): Production {
  const ready = deployments
    .filter((deployment) => deployment.state === "READY" && deployment.target === "production")
    .sort((a, b) => b.created - a.created);
  const [latest, ...older] = ready;
  if (latest === undefined) return { kind: "held", reason: "Vercel lists no ready production deployment" };
  if (latest.uid !== servingId) {
    return { kind: "held", reason: `production serves ${servingId}, not the newest deployment ${latest.uid} (a rollback or a manual promote is in effect)` };
  }
  const request = aliasRequest === undefined || aliasRequest.jobStatus === "failed" || aliasRequest.jobStatus === "skipped" ? undefined : aliasRequest;
  if (request?.toDeploymentId === servingId) {
    return { kind: "held", reason: `production serves ${servingId} through a ${request.type}, not a deploy, so it waits for the next deploy` };
  }
  const serving = deployed(latest, undefined);
  if (serving === undefined) return { kind: "held", reason: `production deployment ${latest.uid} has no GitHub commit, so there's no release to check` };
  const before = older.find((deployment) => deployment.readySubstate === "PROMOTED");
  const dating = request !== undefined && request.jobStatus === "succeeded" && request.requestedAt <= serving.liveAt ? request : undefined;
  return { kind: "ok", serving, previous: before === undefined ? undefined : deployed(before, dating) };
}

// After Instant Rollback, Vercel builds new production deployments but doesn't put them live until one is promoted.
// While a rollback that succeeded holds production (it still serves the rollback's target), this is the deployment the
// rollback replaced, which names the guardian's incident. Otherwise undefined.
export function rolledBackFrom(servingId: string, aliasRequest: AliasRequest | undefined): string | undefined {
  if (aliasRequest?.type !== "rollback" || aliasRequest.jobStatus !== "succeeded" || aliasRequest.toDeploymentId !== servingId) return undefined;
  return aliasRequest.fromDeploymentId ?? undefined;
}

// A PR as `gh pr list --json number,url,body,headRefName,isCrossRepository,labels,mergeCommit` lists it.
export type ListedPr = {
  readonly number: number;
  readonly url: string;
  readonly body: string;
  readonly headRefName: string;
  readonly isCrossRepository: boolean;
  readonly labels: readonly { readonly name: string }[];
  readonly mergeCommit: { readonly oid: string } | null;
};

const INCIDENT_MARKER = /<!-- guardian-incident: \S+ -->/;

// A revert the guardian opened: a revert branch of this repository, the revert label and an incident marker. The
// guardian's promote and post-merge's "Reverted" row both ask this.
export function isGuardianRevert(pr: Pick<ListedPr, "body" | "headRefName" | "isCrossRepository" | "labels">): boolean {
  return (
    !pr.isCrossRepository &&
    parseRevertBranch(pr.headRefName) !== undefined &&
    pr.labels.some((label) => label.name === REVERT_LABEL) &&
    INCIDENT_MARKER.test(pr.body)
  );
}

export type MergedRevert = { readonly number: number; readonly url: string; readonly mergeCommit: string };

// The guardian's merged revert for an incident: one whose body has that incident's marker.
export function incidentRevert(prs: readonly ListedPr[], servingId: string): MergedRevert | undefined {
  const marker = incidentMarker(servingId);
  for (const pr of prs) {
    if (!isGuardianRevert(pr) || !pr.body.includes(marker) || pr.mergeCommit === null) continue;
    return { number: pr.number, url: pr.url, mergeCommit: pr.mergeCommit.oid };
  }
  return undefined;
}

// Why the guardian won't promote yet, or undefined. Once promoted, Vercel deploys main automatically again, so the
// pause has to be on main first: no agent change rides along. A human keeps production on the rollback by adding
// needs-human to the incident issue.
export function promoteBlock(pausedOnMain: string | undefined, now: Date, issueLabels: readonly string[]): string | undefined {
  if (issueLabels.includes(NEEDS_HUMAN_LABEL)) return `the incident issue has ${NEEDS_HUMAN_LABEL}, so production stays on the rollback until a human promotes`;
  if (!pauseState(pausedOnMain, now).paused) return "the loop isn't paused on main yet (.evolution/PAUSED), so it waits for the pause PR";
  return undefined;
}

// The deployment to promote once the revert merged: the oldest ready production deployment whose commit has the
// revert (hasRevert asks git), other than the one production serves. That's the revert's own deployment when Vercel
// built it, so as few unjudged commits as possible go live with it.
export function promoteTarget(deployments: readonly VercelDeployment[], servingId: string, hasRevert: (sha: string) => boolean): Deployed | undefined {
  const candidates = deployments
    .filter((deployment) => deployment.state === "READY" && deployment.target === "production" && deployment.uid !== servingId)
    .sort((a, b) => a.created - b.created);
  for (const candidate of candidates) {
    const live = deployed(candidate, undefined);
    if (live !== undefined && hasRevert(live.sha)) return live;
  }
  return undefined;
}

export type Window = { readonly start: Date; readonly end: Date };

// The current release since it went live (at most windowMinutes back), and the previous release over the same span
// before that, cut to the time it was live.
export function checkWindows(
  servingLiveAt: number,
  previousLiveAt: number | undefined,
  now: Date,
  windowMinutes: number,
): { readonly current: Window; readonly baseline: Window } {
  const span = windowMinutes * 60_000;
  const baselineStart = previousLiveAt === undefined ? servingLiveAt : Math.max(previousLiveAt, servingLiveAt - span);
  return {
    current: { start: new Date(Math.max(servingLiveAt, now.getTime() - span)), end: now },
    baseline: { start: new Date(baselineStart), end: new Date(servingLiveAt) },
  };
}

export function minutesIn(window: Window): number {
  return Math.max(0, (window.end.getTime() - window.start.getTime()) / 60_000);
}

export function countOf(rows: readonly Record<string, unknown>[]): number {
  const count = rows[0]?.["count()"];
  return typeof count === "number" ? count : 0;
}

export type IssueCount = { readonly issue: string; readonly events: number };

export function issueCounts(rows: readonly Record<string, unknown>[]): IssueCount[] {
  return rows.flatMap((row) => {
    const issue = row.issue;
    const events = row["count()"];
    return typeof issue === "string" && typeof events === "number" ? [{ issue, events }] : [];
  });
}

export type SentryNumbers = {
  readonly currentErrors: number;
  readonly currentMinutes: number;
  readonly baselineErrors: number;
  readonly baselineMinutes: number;
  readonly newUnhandled: readonly IssueCount[];
};

// expected is the previous release's errors scaled to the current window; noRate says why there's no rate to compare.
export type Verdict = {
  readonly spike: boolean;
  readonly expected: number | undefined;
  readonly noRate: string | undefined;
  readonly reasons: readonly string[];
};

// A spike: at least minEvents errors and spikeMultiplier times the previous release's rate over the same length of
// time (as if it had at least 1), or a new unhandled error with at least minEvents events. The rate needs the previous
// release to have been live MIN_BASELINE_MINUTES, and this one live at most RATE_WINDOWS windows; otherwise only new
// unhandled errors count.
export function spikeVerdict(numbers: SentryNumbers, sentry: EvolutionConfig["sentry"], liveMinutes: number): Verdict {
  const rateMinutes = RATE_WINDOWS * sentry.windowMinutes;
  const noRate =
    numbers.baselineMinutes < MIN_BASELINE_MINUTES
      ? `the previous release was live only ${numbers.baselineMinutes.toFixed(0)} min before this one`
      : liveMinutes > rateMinutes
        ? `this release has been live ${liveMinutes.toFixed(0)} min, and rates are compared only in its first ${String(rateMinutes)}`
        : undefined;
  const expected = noRate === undefined ? numbers.baselineErrors * (numbers.currentMinutes / numbers.baselineMinutes) : undefined;
  const reasons: string[] = [];
  if (expected !== undefined && numbers.currentErrors >= sentry.minEvents && numbers.currentErrors >= sentry.spikeMultiplier * Math.max(expected, 1)) {
    reasons.push(
      `${String(numbers.currentErrors)} errors in ${numbers.currentMinutes.toFixed(0)} min, at least ${String(sentry.spikeMultiplier)}× the ${expected.toFixed(1)} the previous release had in the same time`,
    );
  }
  for (const { issue, events } of numbers.newUnhandled) {
    if (events >= sentry.minEvents) reasons.push(`new unhandled error ${issue} with ${String(events)} events`);
  }
  return { spike: reasons.length > 0, expected, noRate, reasons };
}

export type MainCommit = {
  readonly sha: string;
  readonly pr: { readonly number: number; readonly title: string; readonly url: string; readonly evolution: boolean } | undefined;
};

// The newest evolution merge among the commits that went live with this deployment (newest first). Only an agent's
// change is reverted automatically; a human's change is rolled back and left to the human.
export function culpritCommit(commits: readonly MainCommit[]): (MainCommit & { readonly pr: NonNullable<MainCommit["pr"]> }) | undefined {
  for (const commit of commits) if (commit.pr?.evolution === true) return { ...commit, pr: commit.pr };
  return undefined;
}

export function revertBranch(prNumber: number, sha: string): string {
  return `${GUARDIAN_BRANCH_PREFIX}revert-${String(prNumber)}-${sha.slice(0, 7)}`;
}

// The PR and the short commit a guardian revert branch names, or undefined for any other branch.
export function parseRevertBranch(branch: string): { readonly pr: number; readonly sha7: string } | undefined {
  const match = /^guardian\/revert-([1-9]\d*)-([0-9a-f]{7})$/.exec(branch);
  return match?.[1] === undefined || match[2] === undefined ? undefined : { pr: Number(match[1]), sha7: match[2] };
}

export function pauseBranch(prNumber: number, sha: string): string {
  return `${GUARDIAN_BRANCH_PREFIX}pause-${String(prNumber)}-${sha.slice(0, 7)}`;
}

// Written into the guardian's issue and PRs, so a later run finds that it already acted on this deployment.
export function incidentMarker(servingId: string): string {
  return `<!-- guardian-incident: ${servingId} -->`;
}

function untilOf(text: string): string | null | undefined {
  try {
    const until = (JSON.parse(text) as { until?: unknown }).until;
    return until === null || typeof until === "string" ? until : undefined;
  } catch {
    return undefined;
  }
}

// The new .evolution/PAUSED, or undefined to leave the file alone. It only ever extends a pause, which is what
// guardrails let an agent PR do: an open-ended pause (until: null) or one it can't read stays as it is.
export function nextPause(existing: string | undefined, now: Date, reason: string): string | undefined {
  const until = new Date(now.getTime() + PAUSE_HOURS * 3_600_000);
  if (existing !== undefined) {
    const current = untilOf(existing);
    if (typeof current !== "string" || Number.isNaN(Date.parse(current)) || Date.parse(current) >= until.getTime()) return undefined;
  }
  return `${JSON.stringify({ until: until.toISOString(), reason }, null, 2)}\n`;
}

// .evolution/config.json with trustLevel one lower and every other byte the same, or undefined at level 0.
export function loweredTrust(text: string): { readonly text: string; readonly from: number; readonly to: number } | undefined {
  const from = (JSON.parse(text) as { trustLevel?: unknown }).trustLevel;
  if (typeof from !== "number" || !Number.isInteger(from) || from <= 0) return undefined;
  const lowered = text.replace(/("trustLevel"\s*:\s*)\d+/, `$1${String(from - 1)}`);
  if ((JSON.parse(lowered) as { trustLevel?: unknown }).trustLevel !== from - 1) throw new Error("couldn't lower trustLevel in place");
  return { text: lowered, from, to: from - 1 };
}
