import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRevert } from "../trust-report/ladder";
import {
  incidentSummary,
  notifyIssue,
  pausePrBody,
  pauseTitle,
  promotedComment,
  promoteUnconfirmedComment,
  retriedRollbackComment,
  revertPrBody,
  revertTitle,
  type Incident,
  type Outcome,
} from "./guardian-report";

const root = join(import.meta.dirname, "..", "..");
const SENTRY = { windowMinutes: 60, spikeMultiplier: 3, minEvents: 5 };
const MARKER = "<!-- guardian-incident: dpl_new -->";

const incident: Incident = {
  checkedAt: "2026-10-24T12:00:00.000Z",
  serving: { id: "dpl_new", url: "petri-new.vercel.app", sha: "b".repeat(40), liveAt: Date.parse("2026-10-24T11:40:00Z") },
  previous: { id: "dpl_old", url: "petri-old.vercel.app", sha: "a".repeat(40), liveAt: Date.parse("2026-10-23T09:00:00Z") },
  currentWindow: { start: "2026-10-24T11:40:00.000Z", end: "2026-10-24T12:00:00.000Z" },
  numbers: { currentErrors: 31, currentMinutes: 20, baselineErrors: 3, baselineMinutes: 60, newUnhandled: [{ issue: "PETRI-7", events: 20 }] },
  verdict: { spike: true, expected: 1, noRate: undefined, reasons: ["31 errors in 20 min", "new unhandled error PETRI-7 with 20 events"] },
  culprit: { sha: "b".repeat(40), pr: { number: 63, title: "feat(blob): blink every few seconds", url: "https://github.com/x/y/pull/63" } },
  problems: [],
  runUrl: "https://github.com/x/y/actions/runs/1",
};

function headings(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.startsWith("## "));
}

const templateHeadings = headings(readFileSync(join(root, ".github", "pull_request_template.md"), "utf8"));

describe("incidentSummary", () => {
  it("states what production serves, the numbers, the verdict and the change", () => {
    const summary = incidentSummary(incident, SENTRY);
    expect(summary).toContain("petri-new.vercel.app (commit `bbbbbbb`), live since 2026-10-24T11:40:00.000Z");
    expect(summary).toContain("31 in the last 20 min; the previous release (`aaaaaaa`) had 3 in its last 60 min live, so about 1.0 were expected");
    expect(summary).toContain("**New unhandled errors:** PETRI-7 (20 events)");
    expect(summary).toContain("**Verdict:** spike: 31 errors in 20 min; new unhandled error PETRI-7 with 20 events");
    expect(summary).toContain("#63 feat(blob): blink every few seconds (`bbbbbbb`)");
  });

  it("says what a spike would be when there isn't one", () => {
    const calm = { ...incident, numbers: { ...incident.numbers, newUnhandled: [] }, verdict: { spike: false, expected: 1, noRate: undefined, reasons: [] }, culprit: undefined };
    const summary = incidentSummary(calm, SENTRY);
    expect(summary).toContain("no spike (a spike is at least 5 errors and 3× the previous release's rate");
    expect(summary).toContain("**New unhandled errors:** none");
    expect(summary).toContain("none (no evolution merge went live with it)");
  });

  it("says when only new unhandled errors count", () => {
    const brief = { ...incident, verdict: { ...incident.verdict, expected: undefined, noRate: "the previous release was live only 10 min before this one" } };
    expect(incidentSummary(brief, SENTRY)).toContain(
      "no rate comparison with the previous release (`aaaaaaa`): the previous release was live only 10 min before this one, so only new unhandled errors count",
    );
    expect(incidentSummary({ ...brief, previous: undefined }, SENTRY)).toContain("no previous production deployment to compare with");
  });

  it("says when the change is unknown because a lookup failed", () => {
    const summary = incidentSummary({ ...incident, culprit: undefined, problems: ["finding the evolution change that went live: HTTP 502"] }, SENTRY);
    expect(summary).toContain("**Evolution change in this deployment:** unknown (a GitHub lookup failed, below)");
    expect(summary).toContain("- **Lookup failed:** finding the evolution change that went live: HTTP 502");
  });
});

describe("the guardian's PRs", () => {
  it("fills every section of the PR template, and marks the incident", () => {
    const revert = revertPrBody(incident, "SUMMARY");
    expect(headings(revert)).toEqual(templateHeadings);
    expect(revert).toContain("It rolls production back to `aaaaaaa` and reverts #63 here");
    expect(revert).toContain(MARKER);
    const pause = pausePrBody(incident, "SUMMARY", { pauseUntil: "2026-10-25T12:00:00.000Z", trust: { from: 1, to: 0 } });
    expect(headings(pause)).toEqual(templateHeadings);
    expect(pause).toContain("It pauses the loop until 2026-10-25T12:00:00.000Z and lowers trustLevel from 1 to 0.");
    expect(pause).toContain(MARKER);
  });

  it("says when the pause and the trust level stay as they are", () => {
    expect(pausePrBody(incident, "SUMMARY", { pauseUntil: undefined, trust: undefined })).toContain(
      "It leaves the existing, longer pause as it is and leaves trustLevel at 0.",
    );
  });

  it("titles the revert the way git and trust-report name one, and the pause PR so it doesn't count as a revert", () => {
    expect(revertTitle("feat(blob): blink")).toBe('Revert "feat(blob): blink"');
    expect(isRevert({ number: 1, title: revertTitle("feat(blob): blink"), mergedAt: "", labels: [] })).toBe(true);
    const both = { pauseUntil: "2026-10-25T12:00:00.000Z", trust: { from: 1, to: 0 } };
    expect(pauseTitle(63, both)).toBe("chore(evolution): pause the loop and lower trust after #63");
    expect(pauseTitle(63, { ...both, trust: undefined })).toBe("chore(evolution): pause the loop after #63");
    expect(pauseTitle(63, { ...both, pauseUntil: undefined })).toBe("chore(evolution): lower trust after #63");
    expect(isRevert({ number: 2, title: pauseTitle(63, both), mergedAt: "", labels: [] })).toBe(false);
  });
});

describe("notifyIssue", () => {
  const done: Outcome = {
    rollback: "done",
    revert: { url: "https://github.com/x/y/pull/64" },
    pause: { url: "https://github.com/x/y/pull/65" },
    changes: { pauseUntil: "2026-10-25T12:00:00.000Z", trust: { from: 1, to: 0 } },
  };

  it("reports the rollback, both PRs and what the maintainer still has to do", () => {
    const { title, body } = notifyIssue(incident, "SUMMARY", done);
    expect(title).toBe("Guardian: production rolled back after #63");
    expect(body).toContain("Rolled production back to petri-old.vercel.app (`aaaaaaa`).");
    expect(body).toContain("Opened https://github.com/x/y/pull/64 to revert #63. It merges itself once its checks pass.");
    expect(body).toContain("Opened https://github.com/x/y/pull/65, which merges itself once its checks pass. It pauses the loop until 2026-10-25T12:00:00.000Z and lowers trustLevel from 1 to 0.");
    expect(body).toContain("Once the revert and the pause have merged and the revert's deployment is ready, the guardian promotes it on its next run (dispatch `evolution-guardian` with `act` to run it now)");
    expect(body).toContain("add `needs-human` to this issue");
    expect(body).toContain("`/postmortem #63`");
    expect(body).toContain("The pause ends on its own");
    expect(body).toContain(MARKER);
  });

  it("is loud about a failed rollback and PRs that couldn't be opened", () => {
    const { body } = notifyIssue(incident, "SUMMARY", {
      ...done,
      rollback: "failed",
      revert: { problem: "the revert doesn't apply cleanly" },
      pause: { problem: "opening the pause PR failed" },
    });
    expect(body).toContain("**The rollback failed.**");
    expect(body).not.toContain("the guardian promotes it");
    expect(body).toContain("**No revert PR:** the revert doesn't apply cleanly");
    expect(body).toContain("**No pause PR:** opening the pause PR failed");
    expect(body).toContain("The loop isn't paused yet: merge the pause PR if there is one, or pause it by hand (`pnpm evolution:pause`)");
    expect(body).not.toContain("The pause ends on its own");
  });

  it("says a rollback Vercel accepted but didn't finish isn't confirmed, and still asks for the promote", () => {
    const { body } = notifyIssue(incident, "SUMMARY", { ...done, rollback: "pending" });
    expect(body).toContain("**The rollback isn't confirmed.** Vercel accepted the rollback to petri-old.vercel.app (`aaaaaaa`)");
    expect(body).toContain("the guardian promotes it");
  });

  it("says when there was nothing to pause or lower", () => {
    const { body } = notifyIssue(incident, "SUMMARY", { ...done, pause: "unchanged", changes: { pauseUntil: undefined, trust: undefined } });
    expect(body).toContain("No pause PR: the loop is already paused for longer and trustLevel is already 0.");
  });

  it("leaves a human's change to the human", () => {
    const { title, body } = notifyIssue({ ...incident, culprit: undefined }, "SUMMARY", { ...done, revert: undefined, pause: undefined, changes: undefined });
    expect(title).toBe("Guardian: error spike in production (bbbbbbb)");
    expect(body).toContain("No revert PR: the change that went live isn't an evolution PR");
    expect(body).toContain("The guardian only promotes after its own revert, so once a fix has merged and deployed, promote it by hand");
    expect(body).not.toContain("the guardian promotes it");
    expect(body).not.toContain("pause");
  });

  it("tells the open issue when a retried rollback worked", () => {
    const comment = retriedRollbackComment(incident);
    expect(comment).toContain("The guardian retried the rollback (https://github.com/x/y/actions/runs/1): production serves petri-old.vercel.app (`aaaaaaa`) again.");
    expect(comment).toContain("the guardian promotes it");
  });

  it("tells the issue which deployment the guardian promoted, and that a human watches it until the next deploy", () => {
    const target = { id: "dpl_rev", url: "petri-rev.vercel.app", sha: "d".repeat(40), liveAt: 0 };
    const comment = promotedComment({ number: 64, url: "https://github.com/x/y/pull/64" }, target, "https://github.com/x/y/actions/runs/2");
    expect(comment).toContain("The revert #64 merged, so the guardian promoted its deployment, petri-rev.vercel.app (`ddddddd`), to production (https://github.com/x/y/actions/runs/2).");
    expect(comment).toContain("The guardian doesn't judge a promoted deployment until the next deploy. Watch Sentry for the next hour");
    expect(promoteUnconfirmedComment(target, "https://github.com/x/y/actions/runs/2")).toContain(
      "**The promote isn't confirmed.** The guardian promoted petri-rev.vercel.app (`ddddddd`) (https://github.com/x/y/actions/runs/2), but production hadn't switched to it after 3 minutes.",
    );
  });
});
