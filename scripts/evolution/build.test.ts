import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { branchName, builderJsonSchema, builderReportSchema, prDataFromBody, prTitle, renderIssueJson, renderPrBody, slugify, type BuilderReport, type BuiltIssue } from "./build";
import { finalShots } from "./screenshots";

const issue: BuiltIssue = {
  number: 42,
  url: "https://github.com/o/r/issues/42",
  title: "Give the blob a tiny hat",
  userStory: "As a visitor, I want the blob to wear a tiny hat so that it looks dapper.",
  acceptanceCriteria: [{ criterion: "The blob wears a hat", verify: ["Open /", "blob-hat is visible"] }],
  featureId: "blob",
  riskLevel: "low",
  feedbackIds: ["00000000-0000-4000-8000-000000000001"],
  laterSteps: [],
};

const report: BuilderReport = {
  outcome: "done",
  reproduction: "blob.poke showed no hat (step 2 screenshot).",
  whatChanged: ["Added a hat to the blob SVG", "Ping @octocat"],
  flows: ["blob.poke", "blob.hat"],
  risk: "Only the blob's SVG changes.",
  rollback: "Revert this PR.",
};

describe("slugify and branchName", () => {
  it("make a short, safe branch name", () => {
    expect(branchName(42, "Give the blob a tiny hat!")).toBe("evo/42-give-the-blob-a-tiny-hat");
    expect(slugify("Ünïcödé & `rm -rf /` …")).toBe("unicode-rm-rf");
    expect(slugify("x".repeat(60))).toHaveLength(40);
    expect(slugify("!!!")).toBe("change");
  });
});

describe("renderIssueJson", () => {
  it("gives the builder and the verifier this step's fields and none of the later steps", () => {
    expect(JSON.parse(renderIssueJson({ ...issue, laterSteps: ["Make Blobby look surprised"] }))).toEqual({
      title: issue.title,
      userStory: issue.userStory,
      acceptanceCriteria: issue.acceptanceCriteria,
      featureId: "blob",
      riskLevel: "low",
      feedbackIds: issue.feedbackIds,
      number: 42,
      url: "https://github.com/o/r/issues/42",
    });
  });
});

describe("builderReportSchema", () => {
  it("accepts a report and rejects bad flow names or extra fields", () => {
    expect(builderReportSchema.safeParse(report).success).toBe(true);
    expect(builderReportSchema.safeParse({ ...report, flows: ["blob poke"] }).success).toBe(false);
    expect(builderReportSchema.safeParse({ ...report, merge: true }).success).toBe(false);
    expect(JSON.parse(builderJsonSchema())).not.toHaveProperty("$schema");
  });
});

describe("renderPrBody", () => {
  const body = renderPrBody({
    issue,
    report,
    verifySummary: "# verify:all\nall pass",
    compareSummary: "# compare\nPASS",
    before: ["https://x.supabase.co/b.png"],
    after: ["https://x.supabase.co/a.png"],
  });

  it("fills every section of the PR template, in order", () => {
    const sections = ["## Why", "## What changed", "## Feature(s) touched", "## Verification report + screenshots", "## Risk", "## Rollback"];
    const positions = sections.map((section) => body.indexOf(section));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(body).toContain("Closes #42.");
    expect(body).toContain("![Before 1](https://x.supabase.co/b.png)");
    expect(body).toContain("riskLevel: low.");
  });

  it("defangs mentions in the builder's text and round-trips the data comment", () => {
    expect(body).toContain("Ping @​octocat");
    expect(prDataFromBody(body)).toEqual({
      issueNumber: 42,
      featureId: "blob",
      riskLevel: "low",
      feedbackIds: issue.feedbackIds,
      before: ["https://x.supabase.co/b.png"],
      after: ["https://x.supabase.co/a.png"],
    });
    expect(prDataFromBody("no data")).toBeUndefined();
  });

  it("titles the PR as a conventional commit", () => {
    expect(prTitle(issue)).toBe("feat(blob): Give the blob a tiny hat");
  });
});

describe("finalShots", () => {
  it("takes the last screenshot of each flow, before and after", () => {
    const step = (screenshot: string | null) => ({ screenshot });
    const shots = finalShots(
      { flows: [{ name: "blob.poke", base: { steps: [step("step-01.png"), step("step-03.png"), step(null)] }, pr: { steps: [step("step-04.png")] } }] },
      "/run",
      "pr/evo-42",
    );
    expect(shots).toEqual({
      before: [{ file: resolve("/run", "base", "blob.poke", "step-03.png"), key: "pr/evo-42/before/blob.poke/step-03.png" }],
      after: [{ file: resolve("/run", "pr", "blob.poke", "step-04.png"), key: "pr/evo-42/after/blob.poke/step-04.png" }],
    });
  });
});
