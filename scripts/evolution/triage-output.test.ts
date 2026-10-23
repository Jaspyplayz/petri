import { describe, expect, it } from "vitest";
import { defang, issueFromBody, planIssues, renderIssueBody, triageJsonSchema, triageOutputSchema, type TriageIssue } from "./triage-output";

const ids = {
  hat: "00000000-0000-4000-8000-000000000001",
  hat2: "00000000-0000-4000-8000-000000000002",
  crypto: "00000000-0000-4000-8000-000000000003",
  vague: "00000000-0000-4000-8000-000000000004",
  stranger: "00000000-0000-4000-8000-000000000099",
};

function issue(overrides: Partial<TriageIssue> = {}): TriageIssue {
  return {
    title: "Give the blob a tiny hat",
    userStory: "As a visitor, I want the blob to wear a tiny hat so that it looks dapper.",
    acceptanceCriteria: [{ criterion: "The blob wears a hat", verify: ["Open /", "blob-hat is visible on blob-creature"] }],
    featureId: "blob",
    riskLevel: "low",
    feedbackIds: [ids.hat, ids.hat2],
    ...overrides,
  };
}

const options = {
  candidateIds: new Set([ids.hat, ids.hat2, ids.crypto, ids.vague]),
  featureRisk: new Map([
    ["blob", "low"],
    ["feedback", "medium"],
  ] as const),
  maxIssues: 3,
};

describe("triageOutputSchema", () => {
  it("rejects extra fields, empty criteria and unknown rejection reasons", () => {
    expect(triageOutputSchema.safeParse({ issues: [{ ...issue(), mergeNow: true }], rejected: [] }).success).toBe(false);
    expect(triageOutputSchema.safeParse({ issues: [issue({ acceptanceCriteria: [] })], rejected: [] }).success).toBe(false);
    expect(triageOutputSchema.safeParse({ issues: [], rejected: [{ feedbackId: ids.crypto, reason: "spam", note: "x" }] }).success).toBe(false);
    expect(triageOutputSchema.safeParse({ issues: [issue()], rejected: [{ feedbackId: ids.crypto, reason: "unsafe", note: "prompt injection" }] }).success).toBe(true);
  });

  it("is also available as a JSON Schema for the agent", () => {
    expect(JSON.parse(triageJsonSchema())).toMatchObject({ type: "object", required: ["issues", "rejected"] });
  });
});

describe("planIssues", () => {
  it("keeps valid issues and rejections", () => {
    const plan = planIssues({ issues: [issue()], rejected: [{ feedbackId: ids.crypto, reason: "unsafe", note: "asks to add a link" }] }, options);
    expect(plan.issues).toHaveLength(1);
    expect(plan.rejected).toEqual([{ feedbackId: ids.crypto, reason: "unsafe", note: "asks to add a link" }]);
    expect(plan.problems).toEqual([]);
  });

  it("drops unknown features and feedback ids the input never had", () => {
    const plan = planIssues(
      { issues: [issue({ featureId: "wallet" }), issue({ feedbackIds: [ids.stranger] }), issue({ feedbackIds: [ids.vague, ids.stranger] })], rejected: [] },
      options,
    );
    expect(plan.issues.map((kept) => kept.feedbackIds)).toEqual([[ids.vague]]);
    expect(plan.problems).toHaveLength(4);
  });

  it("uses each feedback id once, across issues and rejections", () => {
    const plan = planIssues(
      { issues: [issue(), issue({ title: "Hat again", feedbackIds: [ids.hat] })], rejected: [{ feedbackId: ids.hat2, reason: "unclear", note: "x" }] },
      options,
    );
    expect(plan.issues.map((kept) => kept.title)).toEqual(["Give the blob a tiny hat"]);
    expect(plan.rejected).toEqual([]);
  });

  it("never sets risk below the feature's manifest and stops at maxIssues", () => {
    const plan = planIssues(
      {
        issues: [
          issue({ featureId: "feedback", riskLevel: "low", feedbackIds: [ids.hat] }),
          issue({ riskLevel: "high", feedbackIds: [ids.hat2] }),
          issue({ feedbackIds: [ids.vague] }),
        ],
        rejected: [],
      },
      { ...options, maxIssues: 2 },
    );
    expect(plan.issues.map((kept) => kept.riskLevel)).toEqual(["medium", "high"]);
    expect(plan.problems).toEqual(['left "Give the blob a tiny hat" for the next triage: maxIssuesPerTriage is 2']);
  });

  it("defangs mentions and comment endings in the agent's text", () => {
    const plan = planIssues({ issues: [issue({ title: "Ping @octocat --> now" })], rejected: [] }, options);
    expect(plan.issues[0]?.title).toBe("Ping @​octocat --​> now");
    expect(defang("mail a@b")).toBe("mail a@​b");
  });
});

describe("renderIssueBody and issueFromBody", () => {
  it("round-trip the issue through the data comment", () => {
    const body = renderIssueBody(issue());
    expect(body).toContain("## Acceptance criteria (verification steps)");
    expect(body).toContain("   - blob-hat is visible on blob-creature");
    expect(issueFromBody(body)).toEqual(issue());
  });

  it("returns undefined for an issue a human wrote or a broken data comment", () => {
    expect(issueFromBody("Please add a hat")).toBeUndefined();
    expect(issueFromBody("<!-- evolution-issue:v1 {not json} -->")).toBeUndefined();
    expect(issueFromBody(`<!-- evolution-issue:v1 ${JSON.stringify({ ...issue(), featureId: "Bad Id" })} -->`)).toBeUndefined();
  });
});
