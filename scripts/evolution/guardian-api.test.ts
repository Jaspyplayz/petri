import { describe, expect, it } from "vitest";
import { productionDeployments, rollBack, sentryNumbers, servingDeploymentId, type Fetch } from "./guardian-api";

const VERCEL = { token: "vercel-secret", projectId: "prj_1", teamId: "team_1" };
const SENTRY = { token: "sentry-secret", org: "jaspys-team", project: "petri" };
const SERVING = "b".repeat(40);
const PREVIOUS = "a".repeat(40);

type Call = { readonly url: URL; readonly init: RequestInit | undefined };

function fakeFetch(answers: readonly (readonly [number, unknown])[]): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...answers];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url: new URL(url), init });
      const [status, body] = queue.shift() ?? [500, "no answer left"];
      return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
    },
  };
}

describe("Vercel", () => {
  it("lists the project's production deployments with the token as a bearer header", async () => {
    const { fetch, calls } = fakeFetch([[200, { deployments: [{ uid: "dpl_1", created: 1, state: "READY", target: "production" }] }]]);
    expect(await productionDeployments(VERCEL, fetch)).toEqual([{ uid: "dpl_1", created: 1, state: "READY", target: "production" }]);
    const [call] = calls;
    expect(call?.url.pathname).toBe("/v6/deployments");
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({ projectId: "prj_1", target: "production", limit: "20", teamId: "team_1" });
    expect(call?.init?.headers).toEqual({ Authorization: "Bearer vercel-secret" });
  });

  it("reads which deployment the production alias serves", async () => {
    const { fetch, calls } = fakeFetch([[200, { deploymentId: "dpl_2", alias: "petri-pi.vercel.app" }]]);
    expect(await servingDeploymentId(VERCEL, "petri-pi.vercel.app", fetch)).toBe("dpl_2");
    expect(calls[0]?.url.pathname).toBe("/v4/aliases/petri-pi.vercel.app");
  });

  it("rolls back with a POST to the deployment to go back to", async () => {
    const { fetch, calls } = fakeFetch([[201, {}]]);
    await rollBack(VERCEL, "dpl_1", "guardian: spike", fetch);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/v1/projects/prj_1/rollback/dpl_1");
    expect(calls[0]?.url.searchParams.get("description")).toBe("guardian: spike");
  });

  it("fails on an error status or an unknown shape, without the token in the message", async () => {
    const denied = fakeFetch([[403, { error: { message: "forbidden" } }]]);
    const error = await rollBack(VERCEL, "dpl_1", "x", denied.fetch).catch((caught: unknown) => caught);
    expect(String(error)).toMatch(/rolling production back failed: HTTP 403/);
    expect(String(error)).not.toContain("vercel-secret");
    await expect(servingDeploymentId(VERCEL, "petri-pi.vercel.app", fakeFetch([[200, { alias: "x" }]]).fetch)).rejects.toThrow(/shape the guardian doesn't know/);
  });
});

describe("sentryNumbers", () => {
  const current = { start: new Date("2026-10-24T11:40:00Z"), end: new Date("2026-10-24T12:00:00Z") };
  const baseline = { start: new Date("2026-10-24T10:40:00Z"), end: new Date("2026-10-24T11:40:00Z") };

  it("counts both releases' errors and keeps only the unhandled errors no other release had", async () => {
    const { fetch, calls } = fakeFetch([
      [200, { data: [{ "count()": 31 }] }],
      [200, { data: [{ "count()": 4 }] }],
      [200, { data: [{ issue: "PETRI-7", "count()": 20 }, { issue: "PETRI-2", "count()": 6 }] }],
      [200, { data: [{ issue: "PETRI-2", "count()": 40 }] }],
    ]);
    expect(await sentryNumbers(SENTRY, { serving: SERVING, previous: PREVIOUS, current, baseline }, fetch)).toEqual({
      currentErrors: 31,
      currentMinutes: 20,
      baselineErrors: 4,
      newUnhandled: [{ issue: "PETRI-7", events: 20 }],
    });
    const queries = calls.map((call) => call.url.searchParams.get("query"));
    expect(queries).toEqual([
      `project:petri environment:production release:${SERVING}`,
      `project:petri environment:production release:${PREVIOUS}`,
      `project:petri environment:production release:${SERVING} error.unhandled:true`,
      `project:petri environment:production issue:[PETRI-7,PETRI-2] !release:${SERVING}`,
    ]);
    expect(calls[0]?.url.pathname).toBe("/api/0/organizations/jaspys-team/events/");
    expect(calls[0]?.url.searchParams.get("dataset")).toBe("errors");
    expect(calls[1]?.url.searchParams.get("start")).toBe(baseline.start.toISOString());
    expect(calls[2]?.url.searchParams.getAll("field")).toEqual(["issue", "count()"]);
    expect(calls[3]?.url.searchParams.get("start")).toBe("2026-09-24T12:00:00.000Z");
  });

  it("has no baseline without a previous release, and skips the history query when nothing is unhandled", async () => {
    const { fetch, calls } = fakeFetch([
      [200, { data: [{ "count()": 2 }] }],
      [200, { data: [] }],
    ]);
    expect(await sentryNumbers(SENTRY, { serving: SERVING, previous: undefined, current, baseline }, fetch)).toMatchObject({ baselineErrors: 0, newUnhandled: [] });
    expect(calls).toHaveLength(2);
  });
});
