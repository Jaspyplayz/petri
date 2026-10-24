import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { incidentSummary, notifyIssue, revertPrBody, revertTitle, type Incident, type Outcome } from "./guardian-report";

const root = join(import.meta.dirname, "..", "..");
const SENTRY = { windowMinutes: 60, spikeMultiplier: 3, minEvents: 5 };

const incident: Incident = {
  checkedAt: "2026-10-24T12:00:00.000Z",
  serving: { id: "dpl_new", url: "petri-new.vercel.app", sha: "b".repeat(40), liveAt: Date.parse("2026-10-24T11:40:00Z") },
  previous: { id: "dpl_old", url: "petri-old.vercel.app", sha: "a".repeat(40), liveAt: Date.parse("2026-10-23T09:00:00Z") },
  currentWindow: { start: "2026-10-24T11:40:00.000Z", end: "2026-10-24T12:00:00.000Z" },
  numbers: { currentErrors: 31, currentMinutes: 20, baselineErrors: 3, newUnhandled: [{ issue: "PETRI-7", events: 20 }] },
  verdict: { spike: true, expected: 1, reasons: ["31 errors in 20 min", "new unhandled error PETRI-7 with 20 events"] },
  culprit: { sha: "b".repeat(40), pr: { number: 63, title: "feat(blob): blink every few seconds", url: "https://github.com/x/y/pull/63" } },
  runUrl: "https://github.com/x/y/actions/runs/1",
};

describe("incidentSummary", () => {
  it("states what production serves, the numbers, the verdict and the change", () => {
    const summary = incidentSummary(incident, SENTRY);
    expect(summary).toContain("petri-new.vercel.app (commit `bbbbbbb`), live since 2026-10-24T11:40:00.000Z");
    expect(summary).toContain("31 in the last 20 min; the previous release (`aaaaaaa`) had 3 in its last 60 min, so about 1.0 were expected");
    expect(summary).toContain("**New unhandled errors:** PETRI-7 (20 events)");
    expect(summary).toContain("**Verdict:** spike: 31 errors in 20 min; new unhandled error PETRI-7 with 20 events");
    expect(summary).toContain("#63 feat(blob): blink every few seconds (`bbbbbbb`)");
  });

  it("says what a spike would be when there isn't one", () => {
    const calm = { ...incident, numbers: { ...incident.numbers, newUnhandled: [] }, verdict: { spike: false, expected: 1, reasons: [] }, culprit: undefined };
    const summary = incidentSummary(calm, SENTRY);
    expect(summary).toContain("no spike (a spike is at least 5 errors and 3× the previous release");
    expect(summary).toContain("**New unhandled errors:** none");
    expect(summary).toContain("none (no evolution merge went live with it)");
  });
});

describe("revertPrBody", () => {
  it("fills every section of the PR template", () => {
    const template = readFileSync(join(root, ".github", "pull_request_template.md"), "utf8");
    const headings = template.split(/\r?\n/).filter((line) => line.startsWith("## "));
    const body = revertPrBody(incident, "SUMMARY", { pauseUntil: "2026-10-25T12:00:00.000Z", trust: { from: 1, to: 0 } });
    expect(body.split("\n").filter((line) => line.startsWith("## "))).toEqual(headings);
    expect(body).toContain("rolled production back to `aaaaaaa`");
    expect(body).toContain("the loop pauses until 2026-10-25T12:00:00.000Z");
    expect(body).toContain("trustLevel 1 → 0");
  });

  it("says when the pause and the trust level stay as they are", () => {
    const body = revertPrBody(incident, "SUMMARY", { pauseUntil: undefined, trust: undefined });
    expect(body).toContain("`.evolution/PAUSED` stays as it is");
    expect(body).toContain("trustLevel is already 0");
  });

  it("titles the PR the way git and trust-report name a revert", () => {
    expect(revertTitle("feat(blob): blink")).toBe('Revert "feat(blob): blink"');
  });
});

describe("notifyIssue", () => {
  const done: Outcome = { rollback: "done", revert: { url: "https://github.com/x/y/pull/64" }, pauseUntil: "2026-10-25T12:00:00.000Z", trust: { from: 1, to: 0 } };

  it("reports the rollback, the revert PR and what the maintainer still has to do", () => {
    const { title, body } = notifyIssue(incident, "SUMMARY", done);
    expect(title).toBe("Guardian: production rolled back after #63");
    expect(body).toContain("Rolled production back to petri-old.vercel.app (`aaaaaaa`).");
    expect(body).toContain("Opened https://github.com/x/y/pull/64, which merges itself once its checks pass. It also pauses the loop until 2026-10-25T12:00:00.000Z and lowers trustLevel from 1 to 0.");
    expect(body).toContain("promote its deployment");
    expect(body).toContain("`/postmortem #63`");
  });

  it("is loud about a failed rollback and a revert that couldn't be opened", () => {
    const { body } = notifyIssue(incident, "SUMMARY", { ...done, rollback: "failed", revert: { problem: "the revert doesn't apply cleanly" } });
    expect(body).toContain("**The rollback failed.**");
    expect(body).toContain("**No revert PR:** the revert doesn't apply cleanly");
  });

  it("leaves a human's change to the human", () => {
    const { title, body } = notifyIssue({ ...incident, culprit: undefined }, "SUMMARY", { ...done, revert: undefined });
    expect(title).toBe("Guardian: error spike in production (bbbbbbb)");
    expect(body).toContain("No revert PR: the change that went live isn't an evolution PR");
  });
});
