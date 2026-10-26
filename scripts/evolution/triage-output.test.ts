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
    laterSteps: [],
    changedMeaning: null,
    ...overrides,
  };
}

const options = {
  candidateIds: new Set([ids.hat, ids.hat2, ids.crypto, ids.vague]),
  featureRisk: new Map([
    ["blob", "low"],
    ["feedback", "medium"],
  ] as const),
  stepsBuilt: new Map<string, number>(),
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
    const schema = JSON.parse(triageJsonSchema()) as { required: string[]; properties: { issues: { items: { required: string[] } } } };
    expect(schema).toMatchObject({ type: "object", required: ["issues", "rejected"] });
    expect(schema.properties.issues.items.required).toContain("laterSteps");
    expect(schema.properties.issues.items.required).toContain("changedMeaning");
    expect(triageJsonSchema()).not.toContain("'");
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
    const plan = planIssues(
      { issues: [issue({ title: "Ping @octocat --> now", laterSteps: ["Then ping @octocat -->"], changedMeaning: "You asked @octocat -->" })], rejected: [] },
      options,
    );
    expect(plan.issues[0]?.title).toBe("Ping @​octocat --​> now");
    expect(plan.issues[0]?.laterSteps).toEqual(["Then ping @​octocat --​>"]);
    expect(plan.issues[0]?.changedMeaning).toBe("You asked @​octocat --​>");
    expect(planIssues({ issues: [issue()], rejected: [] }, options).issues[0]?.changedMeaning).toBeNull();
    expect(defang("mail a@b")).toBe("mail a@​b");
  });

  it("clears the later steps of an issue whose feedback already has 4 built steps, so a wish gets at most 5", () => {
    const later = ["Make Blobby look surprised"];
    const plan = planIssues(
      { issues: [issue({ laterSteps: later }), issue({ title: "Make Blobby look happy", feedbackIds: [ids.vague], laterSteps: later })], rejected: [] },
      { ...options, stepsBuilt: new Map([[ids.hat2, 4], [ids.vague, 3]]) },
    );
    expect(plan.issues.map((kept) => kept.laterSteps)).toEqual([[], later]);
    expect(plan.problems).toEqual([`cleared the later steps of "Give the blob a tiny hat": feedback ${ids.hat2} already has 4 built steps, and a feedback item gets at most 5`]);
  });

  it("ships a rejected wish that already has built steps instead of marking it rejected", () => {
    const plan = planIssues(
      {
        issues: [],
        rejected: [
          { feedbackId: ids.crypto, reason: "unsafe", note: "asks to add a link" },
          { feedbackId: ids.vague, reason: "too_big", note: "the rest needs votes the blob can't see" },
        ],
      },
      { ...options, stepsBuilt: new Map([[ids.vague, 2]]) },
    );
    expect(plan.rejected.map((rejection) => rejection.feedbackId)).toEqual([ids.crypto]);
    expect(plan.finished).toEqual([ids.vague]);
    expect(plan.problems).toEqual([`shipped ${ids.vague} with its 2 built steps instead of rejecting the rest (too_big: the rest needs votes the blob can't see)`]);
  });
});

describe("renderIssueBody and issueFromBody", () => {
  it("round-trip the issue through the data comment", () => {
    const body = renderIssueBody(issue());
    expect(body).toContain("## Acceptance criteria (verification steps)");
    expect(body).toContain("   - blob-hat is visible on blob-creature");
    expect(issueFromBody(body)).toEqual(issue());
  });

  it("lists the later steps after the issue's details, only when there are some", () => {
    const body = renderIssueBody(issue({ laterSteps: ["Make Blobby look surprised", "Make Blobby look happy"] }));
    expect(body).toContain("## Later steps\n\nTriage files these as later issues, one at a time, after this one ships.\n\n- Make Blobby look surprised\n- Make Blobby look happy\n");
    expect(body.indexOf("- **Linked feedback:**")).toBeLessThan(body.indexOf("## Later steps"));
    expect(body.indexOf("## Later steps")).toBeLessThan(body.indexOf("Created by evolution-triage"));
    expect(renderIssueBody(issue())).not.toContain("## Later steps");
  });

  it("says how the step differs from the feedback, after the user story, only when it does", () => {
    const note = "You asked Blobby to cheer when your idea gets votes. Blobby can't see votes yet, so it cheers when you poke it.";
    const body = renderIssueBody(issue({ changedMeaning: note }));
    expect(body).toContain(`## Changed from the feedback\n\n${note}\n`);
    expect(body.indexOf("## User story")).toBeLessThan(body.indexOf("## Changed from the feedback"));
    expect(body.indexOf("## Changed from the feedback")).toBeLessThan(body.indexOf("## Acceptance criteria"));
    expect(renderIssueBody(issue())).not.toContain("## Changed from the feedback");
    expect(issueFromBody(body)).toEqual(issue({ changedMeaning: note }));
  });

  it("still reads an issue filed before later steps or notes existed, as one with neither", () => {
    const { title, userStory, acceptanceCriteria, featureId, riskLevel, feedbackIds } = issue();
    const old = { title, userStory, acceptanceCriteria, featureId, riskLevel, feedbackIds };
    expect(issueFromBody(`<!-- evolution-issue:v1 ${JSON.stringify(old)} -->`)).toEqual(issue());
  });

  it("returns undefined for an issue a human wrote or a broken data comment", () => {
    expect(issueFromBody("Please add a hat")).toBeUndefined();
    expect(issueFromBody("<!-- evolution-issue:v1 {not json} -->")).toBeUndefined();
    expect(issueFromBody(`<!-- evolution-issue:v1 ${JSON.stringify({ ...issue(), featureId: "Bad Id" })} -->`)).toBeUndefined();
  });
});
