import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { agentReasons } from "../check-pr/pull-request";
import { protectedPathViolations, type FileReader } from "../check-pr/protected-paths";
import { CONFIG_PATH, PAUSED_PATH } from "./config";
import {
  afterDeployChecks,
  checkWindows,
  countOf,
  culpritCommit,
  deployState,
  guardianRunStatus,
  incidentMarker,
  issueCounts,
  loweredTrust,
  incidentRevert,
  isGuardianRevert,
  minutesIn,
  nextPause,
  parseRevertBranch,
  parseStepOutcomes,
  pauseBranch,
  productionState,
  PROMOTED_LABEL,
  promoteBlock,
  promoteTarget,
  revertBranch,
  rolledBackFrom,
  spikeVerdict,
  stopWatching,
  vercelDeploymentListSchema,
  vercelProjectSchema,
  type ListedPr,
  type VercelDeployment,
} from "./guardian";

const root = join(import.meta.dirname, "..", "..");
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SENTRY = { windowMinutes: 60, spikeMultiplier: 3, minEvents: 5 };
const NOW = new Date("2026-10-24T12:00:00Z");

function deployment(uid: string, created: number, sha: string | undefined, extra: Partial<VercelDeployment> = {}): VercelDeployment {
  return {
    uid,
    created,
    ready: created + 60_000,
    state: "READY",
    readySubstate: "PROMOTED",
    target: "production",
    url: `${uid}.vercel.app`,
    meta: sha === undefined ? {} : { githubCommitSha: sha },
    ...extra,
  };
}

describe("productionState", () => {
  const older = deployment("dpl_old", 1_000, SHA_A);
  const newer = deployment("dpl_new", 2_000, SHA_B);

  it("judges the newest ready production deployment against the one before it", () => {
    expect(productionState([older, newer], "dpl_new", undefined)).toEqual({
      kind: "ok",
      serving: { id: "dpl_new", url: "dpl_new.vercel.app", sha: SHA_B, liveAt: 62_000 },
      previous: { id: "dpl_old", url: "dpl_old.vercel.app", sha: SHA_A, liveAt: 61_000 },
    });
  });

  it("skips previews, failed builds and builds in progress", () => {
    const others = [
      deployment("dpl_preview", 3_000, SHA_B, { target: null }),
      deployment("dpl_error", 4_000, SHA_B, { state: "ERROR" }),
      deployment("dpl_building", 5_000, SHA_B, { state: "BUILDING" }),
    ];
    expect(productionState([...others, older, newer], "dpl_new", undefined).kind).toBe("ok");
  });

  it("holds while production serves anything but the newest deployment (a rollback or a manual promote)", () => {
    expect(productionState([older, newer], "dpl_old", undefined)).toEqual({ kind: "held", reason: expect.stringContaining("rollback") as string });
  });

  it("holds while production serves a deployment a promote or rollback put live, until the next deploy", () => {
    const promote = { type: "promote", toDeploymentId: "dpl_new", requestedAt: 90_000, jobStatus: "succeeded" };
    expect(productionState([older, newer], "dpl_new", promote)).toEqual({ kind: "held", reason: expect.stringContaining("through a promote") as string });
    expect(productionState([older, newer], "dpl_new", { ...promote, jobStatus: "in-progress" }).kind).toBe("held");
    expect(productionState([older, newer], "dpl_new", { ...promote, jobStatus: "failed" }).kind).toBe("ok");
  });

  it("doesn't let a failed, unfinished or later rollback move the previous release's start (the run after a failed rollback)", () => {
    const rollback = { type: "rollback", toDeploymentId: "dpl_old", requestedAt: 900_000 };
    for (const jobStatus of ["failed", "in-progress", "succeeded"]) {
      expect(productionState([older, newer], "dpl_new", { ...rollback, jobStatus })).toMatchObject({ kind: "ok", previous: { id: "dpl_old", liveAt: 61_000 } });
    }
  });

  it("compares with the deployment that served production before, skipping ones that never did", () => {
    const staged = deployment("dpl_staged", 1_500, SHA_B, { readySubstate: "STAGED" });
    expect(productionState([older, staged, newer], "dpl_new", undefined)).toMatchObject({ kind: "ok", previous: { id: "dpl_old" } });
    expect(productionState([staged, newer], "dpl_new", undefined)).toMatchObject({ kind: "ok", previous: undefined });
  });

  it("dates a promoted previous deployment from its promote, not its build", () => {
    const promote = { type: "promote", toDeploymentId: "dpl_old", requestedAt: 61_500, jobStatus: "succeeded" };
    expect(productionState([older, newer], "dpl_new", promote)).toMatchObject({ kind: "ok", previous: { id: "dpl_old", liveAt: 61_500 } });
  });

  it("holds when there's nothing to judge", () => {
    expect(productionState([], "dpl_new", undefined).kind).toBe("held");
    expect(productionState([deployment("dpl_cli", 1_000, undefined)], "dpl_cli", undefined)).toEqual({
      kind: "held",
      reason: expect.stringContaining("no GitHub commit") as string,
    });
  });

  it("has no previous release for the first deployment", () => {
    expect(productionState([newer], "dpl_new", undefined)).toMatchObject({ kind: "ok", previous: undefined });
  });

  it("reads Vercel's list and project, and drops the fields it doesn't use", () => {
    const listed = vercelDeploymentListSchema.parse({
      deployments: [
        {
          uid: "dpl_1",
          name: "petri",
          url: "petri-1.vercel.app",
          created: 1,
          ready: 2,
          state: "READY",
          readySubstate: "PROMOTED",
          isRollbackCandidate: true,
          target: "production",
          meta: { githubCommitSha: SHA_A, githubCommitRef: "main" },
          creator: { uid: "u" },
        },
      ],
      pagination: { count: 1 },
    });
    expect(listed.deployments[0]).toEqual({
      uid: "dpl_1",
      url: "petri-1.vercel.app",
      created: 1,
      ready: 2,
      state: "READY",
      readySubstate: "PROMOTED",
      target: "production",
      meta: { githubCommitSha: SHA_A },
    });
    const request = { fromDeploymentId: "dpl_0", jobStatus: "succeeded", requestedAt: 3, toDeploymentId: "dpl_1", type: "rollback" };
    expect(vercelProjectSchema.parse({ id: "prj_1", name: "petri", lastAliasRequest: request })).toEqual({
      lastAliasRequest: { fromDeploymentId: "dpl_0", jobStatus: "succeeded", requestedAt: 3, toDeploymentId: "dpl_1", type: "rollback" },
    });
    expect(vercelProjectSchema.parse({ id: "prj_1" }).lastAliasRequest).toBeUndefined();
  });
});

describe("after the guardian's rollback", () => {
  const rollback = { type: "rollback", fromDeploymentId: "dpl_bad", toDeploymentId: "dpl_old", requestedAt: 5_000, jobStatus: "succeeded" };
  const SHA_C = "c".repeat(40);
  const SHA_R = "d".repeat(40);

  it("names the deployment a rollback replaced while that rollback holds production", () => {
    expect(rolledBackFrom("dpl_old", rollback, [])).toBe("dpl_bad");
    expect(rolledBackFrom("dpl_new", rollback, [])).toBeUndefined();
    expect(rolledBackFrom("dpl_old", { ...rollback, jobStatus: "in-progress" }, [])).toBeUndefined();
    expect(rolledBackFrom("dpl_old", { ...rollback, type: "promote" }, [])).toBeUndefined();
    expect(rolledBackFrom("dpl_old", { ...rollback, fromDeploymentId: null }, [])).toBeUndefined();
    expect(rolledBackFrom("dpl_old", undefined, [])).toBeUndefined();
  });

  it("reads the rollback from the deployments when Vercel reports no promote or rollback", () => {
    const old = deployment("dpl_old", 1_000, SHA_A);
    const bad = deployment("dpl_bad", 2_000, SHA_B);
    const reverted = deployment("dpl_rev", 3_000, SHA_R, { readySubstate: "STAGED" });
    const cancelled = deployment("dpl_cancelled", 2_500, SHA_C, { state: "CANCELED", readySubstate: null });
    const held = [reverted, cancelled, bad, old];
    expect(rolledBackFrom("dpl_old", undefined, held)).toBe("dpl_bad");
    expect(rolledBackFrom("dpl_bad", undefined, held)).toBeUndefined();
    expect(rolledBackFrom("dpl_rev", undefined, [{ ...reverted, readySubstate: "PROMOTED" }, bad, old])).toBeUndefined();
    expect(rolledBackFrom("dpl_old", undefined, [reverted, { ...bad, readySubstate: "STAGED" }, old])).toBeUndefined();
    expect(rolledBackFrom("dpl_older", undefined, [...held, deployment("dpl_older", 500, SHA_C)])).toBeUndefined();
    expect(rolledBackFrom("dpl_old", { ...rollback, type: "promote", toDeploymentId: "dpl_old" }, held)).toBeUndefined();
  });

  const pr = (number: number, extra: Partial<ListedPr> = {}): ListedPr => ({
    number,
    url: `https://github.com/x/y/pull/${String(number)}`,
    body: `Reverts #63.\n\n${incidentMarker("dpl_bad")}`,
    headRefName: "guardian/revert-63-aaaaaaa",
    isCrossRepository: false,
    labels: [{ name: "evolution:revert" }],
    mergeCommit: { oid: SHA_R },
    ...extra,
  });

  it("knows a guardian revert by its branch, label and incident marker, from this repository", () => {
    expect(isGuardianRevert(pr(1))).toBe(true);
    expect(isGuardianRevert(pr(2, { headRefName: "guardian/pause-63-aaaaaaa" }))).toBe(false);
    expect(isGuardianRevert(pr(3, { labels: [{ name: "evolution" }] }))).toBe(false);
    expect(isGuardianRevert(pr(4, { body: "Reverts #63." }))).toBe(false);
    expect(isGuardianRevert(pr(5, { isCrossRepository: true }))).toBe(false);
  });

  it("finds the incident's merged revert: a guardian revert with that incident's marker", () => {
    const others = [pr(70, { body: incidentMarker("dpl_other") }), pr(71, { labels: [] }), pr(72, { isCrossRepository: true }), pr(73, { mergeCommit: null })];
    expect(incidentRevert([...others, pr(74)], "dpl_bad")).toEqual({ number: 74, url: "https://github.com/x/y/pull/74", mergeCommit: SHA_R, promoted: false });
    expect(incidentRevert(others, "dpl_bad")).toBeUndefined();
  });

  it("knows a revert whose deployment the guardian already promoted by its label", () => {
    const labels = [{ name: "evolution:revert" }, { name: PROMOTED_LABEL }];
    expect(incidentRevert([pr(75, { labels })], "dpl_bad")?.promoted).toBe(true);
  });

  it("promotes only once the pause is on main, and not while a human holds the incident", () => {
    const paused = JSON.stringify({ until: "2026-10-25T12:00:00.000Z", reason: "guardian" });
    expect(promoteBlock(paused, NOW, ["evolution:guardian"])).toBeUndefined();
    expect(promoteBlock(JSON.stringify({ until: null }), NOW, [])).toBeUndefined();
    expect(promoteBlock(undefined, NOW, [])).toMatch(/isn't paused on main yet/);
    expect(promoteBlock(JSON.stringify({ until: "2026-10-24T11:00:00.000Z" }), NOW, [])).toMatch(/isn't paused on main yet/);
    expect(promoteBlock(paused, NOW, ["evolution:guardian", "needs-human"])).toMatch(/has needs-human, so production stays on the rollback/);
  });

  it("promotes the oldest ready production deployment that has the revert, never the one production serves", () => {
    const served = deployment("dpl_old", 1_000, SHA_A);
    const bad = deployment("dpl_bad", 2_000, SHA_B);
    const reverted = deployment("dpl_rev", 3_000, SHA_R, { readySubstate: "STAGED" });
    const later = deployment("dpl_later", 4_000, SHA_C, { readySubstate: "STAGED" });
    const building = deployment("dpl_building", 2_500, SHA_R, { state: "BUILDING" });
    const noCommit = deployment("dpl_cli", 2_600, undefined, { readySubstate: "STAGED" });
    const hasRevert = (sha: string): boolean => sha === SHA_R || sha === SHA_C;
    expect(promoteTarget([served, bad, building, noCommit, reverted, later], "dpl_old", hasRevert)).toMatchObject({ id: "dpl_rev", url: "dpl_rev.vercel.app", sha: SHA_R });
    expect(promoteTarget([served, bad, later], "dpl_old", hasRevert)).toMatchObject({ id: "dpl_later", sha: SHA_C });
    expect(promoteTarget([served, bad, building], "dpl_old", hasRevert)).toBeUndefined();
    expect(promoteTarget([served, bad], "dpl_old", () => false)).toBeUndefined();
    expect(promoteTarget([served], "dpl_old", () => true)).toBeUndefined();
  });

  it("judges the next deploy after the guardian's promote against the promoted deployment, from its promote", () => {
    const served = deployment("dpl_old", 1_000, SHA_A);
    const bad = deployment("dpl_bad", 2_000, SHA_B);
    const reverted = deployment("dpl_rev", 3_000, SHA_R);
    const next = deployment("dpl_next", 900_000, SHA_C);
    const promote = { type: "promote", fromDeploymentId: "dpl_old", toDeploymentId: "dpl_rev", requestedAt: 500_000, jobStatus: "succeeded" };
    expect(productionState([served, bad, reverted], "dpl_rev", promote)).toEqual({ kind: "held", reason: expect.stringContaining("through a promote") as string });
    expect(productionState([served, bad, reverted, next], "dpl_next", promote)).toMatchObject({
      kind: "ok",
      serving: { id: "dpl_next", liveAt: 960_000 },
      previous: { id: "dpl_rev", liveAt: 500_000 },
    });
  });
});

describe("checkWindows", () => {
  const liveAt = NOW.getTime() - 20 * 60_000;

  it("covers the current release since it went live, at most a window back, and the previous release's last window", () => {
    const windows = checkWindows(liveAt, liveAt - 5 * 3_600_000, NOW, 60);
    expect(windows.current).toEqual({ start: new Date(liveAt), end: NOW });
    expect(minutesIn(windows.current)).toBe(20);
    expect(windows.baseline).toEqual({ start: new Date(liveAt - 60 * 60_000), end: new Date(liveAt) });
    expect(minutesIn(checkWindows(NOW.getTime() - 5 * 3_600_000, undefined, NOW, 60).current)).toBe(60);
  });

  it("cuts the baseline to the time the previous release was live, and has none without one", () => {
    expect(minutesIn(checkWindows(liveAt, liveAt - 10 * 60_000, NOW, 60).baseline)).toBe(10);
    expect(minutesIn(checkWindows(liveAt, undefined, NOW, 60).baseline)).toBe(0);
  });
});

describe("Sentry rows", () => {
  it("reads a count and per-issue counts, ignoring rows it can't read", () => {
    expect(countOf([{ "count()": 12 }])).toBe(12);
    expect(countOf([])).toBe(0);
    expect(issueCounts([{ issue: "PETRI-1", "count()": 7 }, { issue: 3, "count()": 1 }, { issue: "PETRI-2" }])).toEqual([{ issue: "PETRI-1", events: 7 }]);
  });
});

describe("spikeVerdict", () => {
  const quiet = { currentErrors: 0, currentMinutes: 60, baselineErrors: 0, baselineMinutes: 60, newUnhandled: [] };

  it("isn't a spike when errors stay under minEvents or near the previous release's rate", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 4 }, SENTRY, 60).spike).toBe(false);
    expect(spikeVerdict({ ...quiet, currentErrors: 20, baselineErrors: 10 }, SENTRY, 60).spike).toBe(false);
  });

  it("is a spike at minEvents and spikeMultiplier times the previous release (or 1, if it had none)", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 5 }, SENTRY, 60)).toMatchObject({ spike: true, expected: 0 });
    const verdict = spikeVerdict({ ...quiet, currentErrors: 30, baselineErrors: 10 }, SENTRY, 60);
    expect(verdict).toMatchObject({ spike: true, expected: 10 });
    expect(verdict.reasons[0]).toMatch(/^30 errors in 60 min, at least 3× the 10\.0/);
  });

  it("compares rates: both releases' errors per minute live", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 8, currentMinutes: 10, baselineErrors: 60 }, SENTRY, 60)).toMatchObject({ spike: false, expected: 10 });
    expect(spikeVerdict({ ...quiet, currentErrors: 30, currentMinutes: 10, baselineErrors: 60 }, SENTRY, 60).spike).toBe(true);
    expect(spikeVerdict({ ...quiet, currentErrors: 60, baselineErrors: 20, baselineMinutes: 20 }, SENTRY, 60)).toMatchObject({ spike: false, expected: 60 });
  });

  it("uses only new unhandled errors when the previous release was live too briefly to give a rate", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 60, baselineMinutes: 10 }, SENTRY, 60)).toEqual({
      spike: false,
      expected: undefined,
      noRate: "the previous release was live only 10 min before this one",
      reasons: [],
    });
    expect(spikeVerdict({ ...quiet, currentErrors: 60, baselineMinutes: 0, newUnhandled: [{ issue: "PETRI-9", events: 6 }] }, SENTRY, 60).spike).toBe(true);
  });

  it("compares rates only in the first two windows after a deploy, not against a baseline from another time of day", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 6, baselineErrors: 2 }, SENTRY, 120).spike).toBe(true);
    expect(spikeVerdict({ ...quiet, currentErrors: 6, baselineErrors: 2 }, SENTRY, 3 * 24 * 60)).toMatchObject({
      spike: false,
      expected: undefined,
      noRate: "this release has been live 4320 min, and rates are compared only in its first 120",
    });
  });

  it("is a spike on a new unhandled error with at least minEvents events", () => {
    const verdict = spikeVerdict({ ...quiet, currentErrors: 5, baselineErrors: 100, newUnhandled: [{ issue: "PETRI-9", events: 5 }, { issue: "PETRI-8", events: 2 }] }, SENTRY, 60);
    expect(verdict.reasons).toEqual(["new unhandled error PETRI-9 with 5 events"]);
  });
});

describe("culpritCommit", () => {
  const pr = (number: number, evolution: boolean) => ({ number, title: `#${String(number)}`, url: `https://github.com/x/y/pull/${String(number)}`, evolution });

  it("picks the newest evolution merge that went live, and nothing when only humans' changes did", () => {
    expect(culpritCommit([{ sha: SHA_B, pr: pr(9, false) }, { sha: SHA_A, pr: pr(8, true) }])?.pr.number).toBe(8);
    expect(culpritCommit([{ sha: SHA_B, pr: pr(9, false) }, { sha: SHA_A, pr: undefined }])).toBeUndefined();
  });

  it("names the branches after the PR and the commit, and marks the incident by its deployment", () => {
    expect(revertBranch(63, SHA_A)).toBe("guardian/revert-63-aaaaaaa");
    expect(pauseBranch(63, SHA_A)).toBe("guardian/pause-63-aaaaaaa");
    expect(incidentMarker("dpl_new")).toBe("<!-- guardian-incident: dpl_new -->");
  });

  it("reads the PR and commit back from a revert branch, and nothing from any other branch", () => {
    expect(parseRevertBranch(revertBranch(63, SHA_A))).toEqual({ pr: 63, sha7: "aaaaaaa" });
    for (const branch of [pauseBranch(63, SHA_A), "guardian/revert-63-aaaaaa", "guardian/revert-0-aaaaaaa", "guardian/revert-63-AAAAAAA", "x/guardian/revert-63-aaaaaaa", "evo/63-hat"]) {
      expect(parseRevertBranch(branch)).toBeUndefined();
    }
  });
});

describe("nextPause", () => {
  const in24h = "2026-10-25T12:00:00.000Z";

  it("pauses for 24 hours, or extends a shorter pause", () => {
    expect(JSON.parse(nextPause(undefined, NOW, "why") ?? "")).toEqual({ until: in24h, reason: "why" });
    expect(JSON.parse(nextPause('{"until":"2026-10-24T13:00:00Z"}', NOW, "why") ?? "")).toMatchObject({ until: in24h });
  });

  it("leaves a longer, open-ended or unreadable pause alone", () => {
    expect(nextPause('{"until":"2026-11-01T00:00:00Z"}', NOW, "why")).toBeUndefined();
    expect(nextPause('{"until":null}', NOW, "why")).toBeUndefined();
    expect(nextPause("not json", NOW, "why")).toBeUndefined();
    expect(nextPause('{"until":"soon"}', NOW, "why")).toBeUndefined();
  });
});

describe("after a deploy", () => {
  const SHA_C = "c".repeat(40);
  const LIVE = Date.parse("2026-10-24T12:00:00Z");

  it("checks 10, 30 and 60 minutes after the deploy went live, skipping times more than 5 minutes past", () => {
    const at = (minutes: number) => LIVE + minutes * 60_000;
    expect(afterDeployChecks(LIVE, at(1))).toEqual([
      { minutes: 10, at: at(10) },
      { minutes: 30, at: at(30) },
      { minutes: 60, at: at(60) },
    ]);
    expect(afterDeployChecks(LIVE, at(15)).map((check) => check.minutes)).toEqual([10, 30, 60]);
    expect(afterDeployChecks(LIVE, at(16)).map((check) => check.minutes)).toEqual([30, 60]);
    expect(afterDeployChecks(LIVE, at(66))).toEqual([]);
  });

  it("is live once production serves the commit's deployment and the guardian judges it", () => {
    const older = deployment("dpl_old", 1_000, SHA_A);
    const ours = deployment("dpl_ours", 2_000, SHA_B);
    const all = [older, ours];
    expect(deployState(all, productionState(all, "dpl_ours", undefined), "dpl_ours", SHA_B)).toMatchObject({ kind: "live", serving: { id: "dpl_ours" } });
  });

  it("waits while the deployment builds, isn't listed yet, or production is held", () => {
    const older = deployment("dpl_old", 1_000, SHA_A);
    const building = deployment("dpl_ours", 2_000, SHA_B, { state: "BUILDING" });
    expect(deployState([older, building], productionState([older, building], "dpl_old", undefined), "dpl_old", SHA_B)).toEqual({
      kind: "waiting",
      reason: "bbbbbbb's deployment dpl_ours is BUILDING",
    });
    expect(deployState([older], productionState([older], "dpl_old", undefined), "dpl_old", SHA_B)).toEqual({
      kind: "waiting",
      reason: "Vercel lists no production deployment of bbbbbbb yet",
    });
    const staged = deployment("dpl_ours", 2_000, SHA_B, { readySubstate: "STAGED" });
    const held = productionState([older, staged], "dpl_old", undefined);
    expect(deployState([older, staged], held, "dpl_old", SHA_B)).toEqual({ kind: "waiting", reason: expect.stringContaining("rollback") as string });
  });

  it("stops when the build failed or a newer deployment went live", () => {
    const older = deployment("dpl_old", 1_000, SHA_A);
    const failed = deployment("dpl_ours", 2_000, SHA_B, { state: "ERROR" });
    expect(deployState([older, failed], productionState([older, failed], "dpl_old", undefined), "dpl_old", SHA_B)).toEqual({
      kind: "stop",
      reason: "the production deployment of bbbbbbb (dpl_ours) is ERROR",
    });
    const ours = deployment("dpl_ours", 2_000, SHA_B);
    const newer = deployment("dpl_newer", 3_000, SHA_C);
    const all = [older, ours, newer];
    expect(deployState(all, productionState(all, "dpl_newer", undefined), "dpl_newer", SHA_B)).toEqual({
      kind: "stop",
      reason: "production serves dpl_newer, a newer deployment than bbbbbbb's",
    });
  });

  it("stops on a cancelled build, and waits while production serves a deployment Vercel doesn't list", () => {
    const older = deployment("dpl_old", 1_000, SHA_A);
    const cancelled = deployment("dpl_ours", 2_000, SHA_B, { state: "CANCELED" });
    expect(deployState([older, cancelled], productionState([older, cancelled], "dpl_old", undefined), "dpl_old", SHA_B)).toEqual({
      kind: "stop",
      reason: "the production deployment of bbbbbbb (dpl_ours) is CANCELED",
    });
    const all = [older, deployment("dpl_ours", 2_000, SHA_B)];
    expect(deployState(all, productionState(all, "dpl_unlisted", undefined), "dpl_unlisted", SHA_B)).toEqual({
      kind: "waiting",
      reason: expect.stringContaining("production serves dpl_unlisted") as string,
    });
  });

  it("waits while a promote put the deployment live, because the guardian doesn't judge a promoted deployment", () => {
    const all = [deployment("dpl_old", 1_000, SHA_A), deployment("dpl_ours", 2_000, SHA_B)];
    const promote = { type: "promote", toDeploymentId: "dpl_ours", requestedAt: 90_000, jobStatus: "succeeded" };
    expect(deployState(all, productionState(all, "dpl_ours", promote), "dpl_ours", SHA_B)).toEqual({
      kind: "waiting",
      reason: "production serves dpl_ours through a promote, not a deploy, so it waits for the next deploy",
    });
  });

  it("stops the checks once production serves another deployment or is held", () => {
    const older = deployment("dpl_old", 1_000, SHA_A);
    const ours = deployment("dpl_ours", 2_000, SHA_B);
    const newer = deployment("dpl_newer", 3_000, SHA_C);
    expect(stopWatching(productionState([older, ours], "dpl_ours", undefined), "dpl_ours")).toBeUndefined();
    expect(stopWatching(productionState([older, ours, newer], "dpl_newer", undefined), "dpl_ours")).toBe("it serves dpl_newer");
    expect(stopWatching(productionState([older, ours], "dpl_old", undefined), "dpl_ours")).toContain("a rollback or a manual promote");
  });
});

describe("guardianRunStatus", () => {
  const quiet = { check: "success", spike: false, promote: false, act: true, job: "success", steps: ["skipped", "skipped"] };

  it("leaves quiet runs out, and records a check that didn't pass as an error", () => {
    expect(guardianRunStatus(quiet)).toBeUndefined();
    expect(guardianRunStatus({ ...quiet, check: "failure" })).toBe("error");
    expect(guardianRunStatus({ ...quiet, check: "cancelled", act: false })).toBe("error");
    expect(guardianRunStatus({ ...quiet, check: "skipped" })).toBe("error");
    expect(guardianRunStatus({ ...quiet, check: "" })).toBe("error");
  });

  it("records a cancelled run that had something to do as an error, though its later steps were only skipped", () => {
    expect(guardianRunStatus({ ...quiet, job: "cancelled" })).toBeUndefined();
    expect(guardianRunStatus({ ...quiet, spike: true, job: "cancelled", steps: ["success", "skipped", "skipped"] })).toBe("error");
    expect(guardianRunStatus({ ...quiet, promote: true, act: false, job: "cancelled" })).toBe("error");
  });

  it("is skipped for a dry run that would have acted, and pass or fail by the steps that acted", () => {
    expect(guardianRunStatus({ ...quiet, spike: true, act: false })).toBe("skipped");
    expect(guardianRunStatus({ ...quiet, spike: true, steps: ["success", "skipped", "success"] })).toBe("pass");
    expect(guardianRunStatus({ ...quiet, promote: true, steps: ["failure"] })).toBe("fail");
    expect(guardianRunStatus({ ...quiet, spike: true, steps: ["success", "cancelled"] })).toBe("fail");
  });

  it("reads the step outcomes the workflow passes, dropping steps that never ran", () => {
    expect(parseStepOutcomes("promote= rollback=success pause=skipped\n  pause-pr=failure revert-pr=")).toEqual({
      rollback: "success",
      pause: "skipped",
      "pause-pr": "failure",
    });
    expect(parseStepOutcomes("")).toEqual({});
  });

  it("gets the outcome of every step that acts, each under its own id", () => {
    type Step = { readonly id?: string; readonly env?: Record<string, string> };
    const workflow = load(readFileSync(join(root, ".github/workflows/evolution-guardian.yml"), "utf8")) as { jobs: { guardian: { steps: Step[] } } };
    const steps = workflow.jobs.guardian.steps;
    const passed = steps.find((step) => step.env?.STEPS !== undefined)?.env?.STEPS ?? "";
    const pairs = [...passed.matchAll(/([\w-]+)=\$\{\{ steps\.([\w-]+)\.outcome \}\}/g)].map((match) => ({ name: match[1], id: match[2] }));
    expect(pairs.filter((pair) => pair.name !== pair.id)).toEqual([]);
    const acting = steps.flatMap((step) => (step.id === undefined || step.id === "check" ? [] : [step.id]));
    expect(acting.length).toBeGreaterThan(0);
    expect(new Set(pairs.map((pair) => pair.id))).toEqual(new Set(acting));
    expect(pairs).toHaveLength(acting.length);
  });
});

describe("loweredTrust", () => {
  it("lowers trustLevel by one and changes nothing else", () => {
    const text = '{\n  "trustLevel": 2,\n  "productionUrl": "https://x.dev"\n}\n';
    expect(loweredTrust(text)).toEqual({ text: '{\n  "trustLevel": 1,\n  "productionUrl": "https://x.dev"\n}\n', from: 2, to: 1 });
  });

  it("leaves level 0 alone", () => {
    expect(loweredTrust('{ "trustLevel": 0 }')).toBeUndefined();
  });
});

describe("the guardian's PRs pass the guardrails for agent PRs", () => {
  const guardrails = loadGuardrailsConfig(root);
  const config = readFileSync(join(root, CONFIG_PATH), "utf8").replace(/("trustLevel"\s*:\s*)\d+/, "$13");

  it("treats a guardian/ branch as an agent PR, even though the bot token acts as the owner", () => {
    const pullRequest = {
      action: "opened",
      number: 1,
      author: "Jaspyplayz",
      authorIsBot: false,
      labels: ["evolution:revert"],
      headRef: revertBranch(1, SHA_A),
      headRepository: "Jaspyplayz/petri",
      baseRef: "main",
      defaultBranch: "main",
      baseSha: SHA_A,
      headSha: SHA_B,
    };
    expect(agentReasons(pullRequest, guardrails)).toEqual(["branch guardian/revert-1-aaaaaaa"]);
    expect(agentReasons({ ...pullRequest, labels: [], headRef: pauseBranch(1, SHA_A) }, guardrails)).toEqual(["branch guardian/pause-1-aaaaaaa"]);
  });

  it("allows a new pause, an extended pause and a lowered trustLevel", () => {
    const lowered = loweredTrust(config)?.text;
    const longer = nextPause('{"until":"2026-10-24T13:00:00Z"}', NOW, "why");
    const files: Record<string, Record<string, string | undefined>> = {
      base: { [CONFIG_PATH]: config, [PAUSED_PATH]: '{"until":"2026-10-24T13:00:00Z"}' },
      head: { [CONFIG_PATH]: lowered, [PAUSED_PATH]: longer },
    };
    const read: FileReader = (side, path) => files[side]?.[path];
    const changes = [
      { path: CONFIG_PATH, status: "modified" as const },
      { path: PAUSED_PATH, status: "modified" as const },
    ];
    expect(protectedPathViolations(changes, guardrails, read)).toEqual([]);
    const added: FileReader = (side, path) => (side === "head" && path === PAUSED_PATH ? nextPause(undefined, NOW, "why") : undefined);
    expect(protectedPathViolations([{ path: PAUSED_PATH, status: "added" }], guardrails, added)).toEqual([]);
  });
});
