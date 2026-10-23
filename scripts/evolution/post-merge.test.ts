import { describe, expect, it } from "vitest";
import type { BuiltIssue, PrData } from "./build";
import { changelogRow, changelogSummary, mergedPrNumber, trustedScreenshots, vercelDeployment, whatChanged, type CommitPr } from "./post-merge";

const SHA = "a".repeat(40);
const SUPABASE = "https://ref.supabase.co";
const shot = (name: string): string => `${SUPABASE}/storage/v1/object/public/verification-screenshots/pr-9/${name}.png`;

describe("mergedPrNumber", () => {
  const pr = (overrides: Partial<CommitPr>): CommitPr => ({ number: 9, merged_at: "2026-10-23T18:00:00Z", merge_commit_sha: SHA, base: { ref: "main" }, ...overrides });

  it("finds the PR whose squash merge is the pushed commit", () => {
    expect(mergedPrNumber([pr({ number: 3, merged_at: null }), pr({})], SHA)).toBe(9);
  });

  it("ignores open PRs, other merge commits and other bases", () => {
    expect(mergedPrNumber([pr({ merged_at: null })], SHA)).toBeUndefined();
    expect(mergedPrNumber([pr({ merge_commit_sha: "b".repeat(40) })], SHA)).toBeUndefined();
    expect(mergedPrNumber([pr({ base: { ref: "feat/x" } })], SHA)).toBeUndefined();
    expect(mergedPrNumber([], SHA)).toBeUndefined();
  });
});

describe("vercelDeployment", () => {
  const status = (state: string, login = "vercel[bot]", context = "Vercel") => ({ context, state, creator: { login } });

  it("reads the newest status Vercel's bot set", () => {
    expect(vercelDeployment([status("success"), status("pending")])).toBe("ready");
    expect(vercelDeployment([status("pending")])).toBe("pending");
    expect(vercelDeployment([status("failure"), status("pending")])).toBe("failed");
    expect(vercelDeployment([status("error")])).toBe("failed");
    expect(vercelDeployment([])).toBe("pending");
  });

  it("doesn't trust a Vercel status from anyone else, or another context", () => {
    expect(vercelDeployment([status("success", "someone"), status("pending")])).toBe("pending");
    expect(vercelDeployment([status("success", "vercel[bot]", "ci-ok")])).toBe("pending");
  });
});

describe("whatChanged and changelogSummary", () => {
  const body = ["## Why", "", "Closes #4.", "", "## What changed", "", "- The blob wears a hat", "- ", "- Hats are blue.", "", "## Feature(s) touched", "", "- not this"].join("\n");

  it("takes the bullets of the What changed section only", () => {
    expect(whatChanged(body)).toEqual(["The blob wears a hat", "Hats are blue."]);
    expect(whatChanged(body.replaceAll("\n", "\r\n"))).toEqual(["The blob wears a hat", "Hats are blue."]);
    expect(whatChanged("no sections")).toEqual([]);
  });

  it("joins the user story and the changes into sentences", () => {
    expect(changelogSummary("As a visitor, I want a hat", whatChanged(body))).toBe("As a visitor, I want a hat. The blob wears a hat. Hats are blue.");
    expect(changelogSummary("  Two\n  lines!  ", [])).toBe("Two lines!");
  });

  it("stays within the 2000 characters the table allows", () => {
    const summary = changelogSummary("x".repeat(3000), []);
    expect(summary).toHaveLength(2000);
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("trustedScreenshots", () => {
  it("keeps files in this project's public screenshot bucket", () => {
    expect(trustedScreenshots([shot("after")], SUPABASE)).toEqual([shot("after")]);
    expect(trustedScreenshots(["http://127.0.0.1:54321/storage/v1/object/public/verification-screenshots/a.png"], "http://127.0.0.1:54321")).toHaveLength(1);
  });

  it("drops other hosts, other buckets, climbing paths, queries and junk", () => {
    expect(
      trustedScreenshots(
        [
          "https://evil.example/storage/v1/object/public/verification-screenshots/a.png",
          `${SUPABASE}/storage/v1/object/public/other-bucket/a.png`,
          `${SUPABASE}/storage/v1/object/public/verification-screenshots/../other-bucket/a.png`,
          `${SUPABASE}/storage/v1/object/public/verification-screenshots/`,
          `${shot("a")}?download=1`,
          "not a url",
        ],
        SUPABASE,
      ),
    ).toEqual([]);
  });
});

describe("changelogRow", () => {
  const issue: BuiltIssue = {
    number: 4,
    url: "https://github.com/o/r/issues/4",
    title: "Give the blob a tiny hat",
    userStory: "As a visitor, I want the blob to wear a hat.",
    acceptanceCriteria: [{ criterion: "Hat", verify: ["Open /"] }],
    featureId: "blob",
    riskLevel: "low",
    feedbackIds: ["00000000-0000-4000-8000-000000000001"],
  };
  const data: PrData = {
    issueNumber: 4,
    featureId: "blob",
    riskLevel: "low",
    feedbackIds: ["00000000-0000-4000-8000-000000000002"],
    before: [shot("before"), "https://evil.example/x.png"],
    after: [shot("after")],
  };
  const pr = { number: 9, url: "https://github.com/o/r/pull/9", body: "## What changed\n\n- Added a hat", mergedAt: "2026-10-23T18:00:00Z", sha: "ABCDEF1".padEnd(40, "0") };

  it("takes the title and feedback from the issue, and the change list and screenshots from the PR", () => {
    expect(changelogRow({ issue, pr, data, trustLevel: 1, supabaseUrl: SUPABASE })).toEqual({
      kind: "change",
      title: "Give the blob a tiny hat",
      summary: "As a visitor, I want the blob to wear a hat. Added a hat.",
      feedback_ids: ["00000000-0000-4000-8000-000000000001"],
      pr_number: 9,
      pr_url: "https://github.com/o/r/pull/9",
      commit_sha: "abcdef1".padEnd(40, "0"),
      trust_level: 1,
      before_screenshot_urls: [shot("before")],
      after_screenshot_urls: [shot("after")],
      merged_at: "2026-10-23T18:00:00Z",
    });
  });
});
