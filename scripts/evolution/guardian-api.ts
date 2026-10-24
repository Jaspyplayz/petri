import { z } from "zod";
import {
  countOf,
  issueCounts,
  MIN_BASELINE_MINUTES,
  minutesIn,
  sentryTableSchema,
  vercelAliasSchema,
  vercelDeploymentListSchema,
  vercelProjectSchema,
  type AliasRequest,
  type SentryNumbers,
  type VercelDeployment,
  type Window,
} from "./guardian";

// The guardian's calls to Vercel's and Sentry's REST APIs. Each answer is checked against the shape the guardian
// relies on, so a changed API stops it with an error instead of a wrong decision.
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type VercelAccess = { readonly token: string; readonly projectId: string; readonly teamId: string };
export type SentryAccess = { readonly token: string; readonly org: string; readonly project: string };

const VERCEL_API = "https://api.vercel.com";
const SENTRY_API = "https://sentry.io";
// How far back an unhandled error counts as already known. Sentry's free plan keeps 30 days of events.
const KNOWN_ISSUE_DAYS = 30;

async function request<T>(fetchImpl: Fetch, url: URL, init: RequestInit, schema: z.ZodType<T>, what: string): Promise<T> {
  const response = await fetchImpl(url.toString(), init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${what} failed: HTTP ${String(response.status)} ${text.slice(0, 300)}`);
  const parsed = schema.safeParse(text === "" ? {} : JSON.parse(text));
  if (!parsed.success) throw new Error(`${what} answered in a shape the guardian doesn't know: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function vercelUrl(path: string, access: VercelAccess, params: Record<string, string>): URL {
  const url = new URL(path, VERCEL_API);
  for (const [key, value] of Object.entries({ ...params, teamId: access.teamId })) url.searchParams.set(key, value);
  return url;
}

function vercelInit(access: VercelAccess, method = "GET"): RequestInit {
  return { method, headers: { Authorization: `Bearer ${access.token}` } };
}

export async function productionDeployments(access: VercelAccess, fetchImpl: Fetch = fetch): Promise<VercelDeployment[]> {
  const url = vercelUrl("/v7/deployments", access, { projectId: access.projectId, target: "production", limit: "20" });
  return (await request(fetchImpl, url, vercelInit(access), vercelDeploymentListSchema, "listing Vercel's production deployments")).deployments;
}

export async function lastAliasRequest(access: VercelAccess, fetchImpl: Fetch = fetch): Promise<AliasRequest | undefined> {
  const url = vercelUrl(`/v9/projects/${encodeURIComponent(access.projectId)}`, access, {});
  return (await request(fetchImpl, url, vercelInit(access), vercelProjectSchema, "reading the Vercel project")).lastAliasRequest ?? undefined;
}

export async function servingDeploymentId(access: VercelAccess, host: string, fetchImpl: Fetch = fetch): Promise<string> {
  const url = vercelUrl(`/v4/aliases/${encodeURIComponent(host)}`, access, { projectId: access.projectId });
  return (await request(fetchImpl, url, vercelInit(access), vercelAliasSchema, `reading which deployment ${host} serves`)).deploymentId;
}

// Instant Rollback. On Hobby, Vercel allows it only to the deployment right before the current one.
export async function rollBack(access: VercelAccess, deploymentId: string, description: string, fetchImpl: Fetch = fetch): Promise<void> {
  const path = `/v1/projects/${encodeURIComponent(access.projectId)}/rollback/${encodeURIComponent(deploymentId)}`;
  await request(fetchImpl, vercelUrl(path, access, { description }), vercelInit(access, "POST"), z.unknown(), "rolling production back");
}

async function sentryTable(
  access: SentryAccess,
  fetchImpl: Fetch,
  fields: readonly string[],
  query: string,
  window: Window,
  extra: Record<string, string> = {},
): Promise<Record<string, unknown>[]> {
  const url = new URL(`/api/0/organizations/${encodeURIComponent(access.org)}/events/`, SENTRY_API);
  url.searchParams.set("dataset", "errors");
  for (const field of fields) url.searchParams.append("field", field);
  url.searchParams.set("query", `project:${access.project} environment:production ${query}`);
  url.searchParams.set("start", window.start.toISOString());
  url.searchParams.set("end", window.end.toISOString());
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  const init = { headers: { Authorization: `Bearer ${access.token}` } };
  return (await request(fetchImpl, url, init, sentryTableSchema, "querying Sentry's errors")).data;
}

export type ReleaseWindows = {
  readonly serving: string;
  readonly previous: string | undefined;
  readonly current: Window;
  readonly baseline: Window;
};

// Errors in the serving release, the previous release's errors in the baseline window (when it's long enough to
// count), and the serving release's unhandled errors that no other release had in the last 30 days.
export async function sentryNumbers(access: SentryAccess, releases: ReleaseWindows, fetchImpl: Fetch = fetch): Promise<SentryNumbers> {
  const currentErrors = countOf(await sentryTable(access, fetchImpl, ["count()"], `release:${releases.serving}`, releases.current));
  const baselineMinutes = releases.previous === undefined ? 0 : minutesIn(releases.baseline);
  const baselineErrors =
    releases.previous === undefined || baselineMinutes < MIN_BASELINE_MINUTES
      ? 0
      : countOf(await sentryTable(access, fetchImpl, ["count()"], `release:${releases.previous}`, releases.baseline));
  const unhandled = issueCounts(
    await sentryTable(access, fetchImpl, ["issue", "count()"], `release:${releases.serving} error.unhandled:true`, releases.current, {
      sort: "-count()",
      per_page: "20",
    }),
  );
  let newUnhandled = unhandled;
  if (unhandled.length > 0) {
    const lookback = { start: new Date(releases.current.end.getTime() - KNOWN_ISSUE_DAYS * 86_400_000), end: releases.current.end };
    const known = issueCounts(
      await sentryTable(access, fetchImpl, ["issue", "count()"], `issue:[${unhandled.map(({ issue }) => issue).join(",")}] !release:${releases.serving}`, lookback),
    );
    const seen = new Set(known.map(({ issue }) => issue));
    newUnhandled = unhandled.filter(({ issue }) => !seen.has(issue));
  }
  return {
    currentErrors,
    currentMinutes: minutesIn(releases.current),
    baselineErrors,
    baselineMinutes,
    newUnhandled,
  };
}
