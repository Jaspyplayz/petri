import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { agentReasons } from "../check-pr/pull-request";
import { protectedPathViolations, type FileReader } from "../check-pr/protected-paths";
import { CONFIG_PATH, PAUSED_PATH } from "./config";
import {
  checkWindows,
  countOf,
  culpritCommit,
  issueCounts,
  loweredTrust,
  minutesIn,
  nextPause,
  productionState,
  revertBranch,
  spikeVerdict,
  vercelDeploymentListSchema,
  type VercelDeployment,
} from "./guardian";

const root = join(import.meta.dirname, "..", "..");
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SENTRY = { windowMinutes: 60, spikeMultiplier: 3, minEvents: 5 };
const NOW = new Date("2026-10-24T12:00:00Z");

function deployment(uid: string, created: number, sha: string | undefined, extra: Partial<VercelDeployment> = {}): VercelDeployment {
  return { uid, created, ready: created + 60_000, state: "READY", target: "production", url: `${uid}.vercel.app`, meta: sha === undefined ? {} : { githubCommitSha: sha }, ...extra };
}

describe("productionState", () => {
  const older = deployment("dpl_old", 1_000, SHA_A);
  const newer = deployment("dpl_new", 2_000, SHA_B);

  it("judges the newest ready production deployment against the one before it", () => {
    expect(productionState([older, newer], "dpl_new")).toEqual({
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
    expect(productionState([...others, older, newer], "dpl_new").kind).toBe("ok");
  });

  it("holds while production serves anything but the newest deployment (a rollback or a manual promote)", () => {
    expect(productionState([older, newer], "dpl_old")).toEqual({ kind: "held", reason: expect.stringContaining("rollback") as string });
  });

  it("holds when there's nothing to judge", () => {
    expect(productionState([], "dpl_new").kind).toBe("held");
    expect(productionState([deployment("dpl_cli", 1_000, undefined)], "dpl_cli")).toEqual({ kind: "held", reason: expect.stringContaining("no GitHub commit") as string });
  });

  it("has no previous release for the first deployment", () => {
    expect(productionState([newer], "dpl_new")).toMatchObject({ kind: "ok", previous: undefined });
  });

  it("reads Vercel's list and drops the fields it doesn't use", () => {
    const listed = vercelDeploymentListSchema.parse({
      deployments: [{ uid: "dpl_1", name: "petri", url: "petri-1.vercel.app", created: 1, ready: 2, state: "READY", target: "production", meta: { githubCommitSha: SHA_A, githubCommitRef: "main" }, creator: { uid: "u" } }],
      pagination: { count: 1 },
    });
    expect(listed.deployments[0]).toEqual({ uid: "dpl_1", url: "petri-1.vercel.app", created: 1, ready: 2, state: "READY", target: "production", meta: { githubCommitSha: SHA_A } });
  });
});

describe("checkWindows", () => {
  it("covers the current release since it went live, at most a window back, and the previous release's last window", () => {
    const liveAt = NOW.getTime() - 20 * 60_000;
    const windows = checkWindows(liveAt, NOW, 60);
    expect(windows.current).toEqual({ start: new Date(liveAt), end: NOW });
    expect(minutesIn(windows.current)).toBe(20);
    expect(windows.baseline).toEqual({ start: new Date(liveAt - 60 * 60_000), end: new Date(liveAt) });
    expect(minutesIn(checkWindows(NOW.getTime() - 5 * 3_600_000, NOW, 60).current)).toBe(60);
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
  const quiet = { currentErrors: 0, currentMinutes: 60, baselineErrors: 0, newUnhandled: [] };

  it("isn't a spike when errors stay under minEvents or near the previous release's rate", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 4 }, SENTRY).spike).toBe(false);
    expect(spikeVerdict({ ...quiet, currentErrors: 20, baselineErrors: 10 }, SENTRY).spike).toBe(false);
  });

  it("is a spike at minEvents and spikeMultiplier times the previous release (or 1, if it had none)", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 5 }, SENTRY)).toMatchObject({ spike: true, expected: 0 });
    const verdict = spikeVerdict({ ...quiet, currentErrors: 30, baselineErrors: 10 }, SENTRY);
    expect(verdict).toMatchObject({ spike: true, expected: 10 });
    expect(verdict.reasons[0]).toMatch(/^30 errors in 60 min, at least 3× the 10\.0/);
  });

  it("scales the previous release's errors to the time the current one has been live", () => {
    expect(spikeVerdict({ ...quiet, currentErrors: 8, currentMinutes: 10, baselineErrors: 60 }, SENTRY)).toMatchObject({ spike: false, expected: 10 });
    expect(spikeVerdict({ ...quiet, currentErrors: 30, currentMinutes: 10, baselineErrors: 60 }, SENTRY).spike).toBe(true);
  });

  it("is a spike on a new unhandled error with at least minEvents events", () => {
    const verdict = spikeVerdict({ ...quiet, currentErrors: 5, baselineErrors: 100, newUnhandled: [{ issue: "PETRI-9", events: 5 }, { issue: "PETRI-8", events: 2 }] }, SENTRY);
    expect(verdict.reasons).toEqual(["new unhandled error PETRI-9 with 5 events"]);
  });
});

describe("culpritCommit", () => {
  const pr = (number: number, evolution: boolean) => ({ number, title: `#${String(number)}`, url: `https://github.com/x/y/pull/${String(number)}`, evolution });

  it("picks the newest evolution merge that went live, and nothing when only humans' changes did", () => {
    expect(culpritCommit([{ sha: SHA_B, pr: pr(9, false) }, { sha: SHA_A, pr: pr(8, true) }])?.pr.number).toBe(8);
    expect(culpritCommit([{ sha: SHA_B, pr: pr(9, false) }, { sha: SHA_A, pr: undefined }])).toBeUndefined();
  });

  it("names the branch after the PR and the commit", () => {
    expect(revertBranch(63, SHA_A)).toBe("guardian/revert-63-aaaaaaa");
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

describe("loweredTrust", () => {
  it("lowers trustLevel by one and changes nothing else", () => {
    const text = '{\n  "trustLevel": 2,\n  "productionUrl": "https://x.dev"\n}\n';
    expect(loweredTrust(text)).toEqual({ text: '{\n  "trustLevel": 1,\n  "productionUrl": "https://x.dev"\n}\n', from: 2, to: 1 });
  });

  it("leaves level 0 alone", () => {
    expect(loweredTrust('{ "trustLevel": 0 }')).toBeUndefined();
  });
});

describe("the revert PR's own edits pass the guardrails for agent PRs", () => {
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
