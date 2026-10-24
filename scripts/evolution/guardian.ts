import { z } from "zod";
import type { EvolutionConfig } from "./config";

// The guardian (evolution-guardian.yml) watches production. This file holds its pure parts: what Vercel and Sentry
// answered, the spike rule, and the files and text it writes. scripts/evolution-guardian.ts does the I/O.

export const GUARDIAN_BRANCH_PREFIX = "guardian/";
export const GUARDIAN_ISSUE_LABEL = "evolution:guardian";
export const PAUSE_HOURS = 24;
// A previous release live for less than this had too few errors to compare a rate with.
export const MIN_BASELINE_MINUTES = 15;

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

// GET /v9/projects/{id}: the project's last promote or rollback, if it ever had one.
export const vercelProjectSchema = z.object({
  lastAliasRequest: z.object({ type: z.string(), toDeploymentId: z.string(), requestedAt: z.number() }).nullish(),
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
// production; deployments built while a rollback held the domain never did, so they're skipped.
export function productionState(deployments: readonly VercelDeployment[], servingId: string, aliasRequest: AliasRequest | undefined): Production {
  const ready = deployments
    .filter((deployment) => deployment.state === "READY" && deployment.target === "production")
    .sort((a, b) => b.created - a.created);
  const [latest, ...older] = ready;
  if (latest === undefined) return { kind: "held", reason: "Vercel lists no ready production deployment" };
  if (latest.uid !== servingId) {
    return { kind: "held", reason: `production serves ${servingId}, not the newest deployment ${latest.uid} (a rollback or a manual promote is in effect)` };
  }
  if (aliasRequest?.toDeploymentId === servingId) {
    return { kind: "held", reason: `production serves ${servingId} through a ${aliasRequest.type}, not a deploy, so it waits for the next deploy` };
  }
  const serving = deployed(latest, undefined);
  if (serving === undefined) return { kind: "held", reason: `production deployment ${latest.uid} has no GitHub commit, so there's no release to check` };
  const before = older.find((deployment) => deployment.readySubstate === "PROMOTED");
  return { kind: "ok", serving, previous: before === undefined ? undefined : deployed(before, aliasRequest) };
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

export type Verdict = { readonly spike: boolean; readonly expected: number | undefined; readonly reasons: readonly string[] };

// A spike: at least minEvents errors and spikeMultiplier times the previous release's rate over the same length of
// time (as if it had at least 1), or a new unhandled error with at least minEvents events. The rate needs the previous
// release to have been live MIN_BASELINE_MINUTES; with less (or none), only new unhandled errors count.
export function spikeVerdict(numbers: SentryNumbers, sentry: EvolutionConfig["sentry"]): Verdict {
  const expected = numbers.baselineMinutes >= MIN_BASELINE_MINUTES ? numbers.baselineErrors * (numbers.currentMinutes / numbers.baselineMinutes) : undefined;
  const reasons: string[] = [];
  if (expected !== undefined && numbers.currentErrors >= sentry.minEvents && numbers.currentErrors >= sentry.spikeMultiplier * Math.max(expected, 1)) {
    reasons.push(
      `${String(numbers.currentErrors)} errors in ${numbers.currentMinutes.toFixed(0)} min, at least ${String(sentry.spikeMultiplier)}× the ${expected.toFixed(1)} the previous release had in the same time`,
    );
  }
  for (const { issue, events } of numbers.newUnhandled) {
    if (events >= sentry.minEvents) reasons.push(`new unhandled error ${issue} with ${String(events)} events`);
  }
  return { spike: reasons.length > 0, expected, reasons };
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
