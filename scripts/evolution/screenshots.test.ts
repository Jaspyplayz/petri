import { describe, expect, it } from "vitest";
import { buildableIssue, type GhIssue } from "./github-issue";
import { checkedPng, finalShots } from "./screenshots";
import { renderIssueBody } from "./triage-output";

const flow = (name: string, screenshot: string) => ({ name, base: { steps: [{ screenshot }] }, pr: { steps: [{ screenshot }] } });

describe("finalShots on a compare.json the PR's code could have written", () => {
  it("refuses flow names and screenshot names that would leave the run folder", () => {
    expect(() => finalShots({ flows: [flow("../../.env", "step-01.png")] }, "/run", "p")).toThrow(/compare.json/);
    expect(() => finalShots({ flows: [flow("blob.poke", "../../../.env.local")] }, "/run", "p")).toThrow(/compare.json/);
    expect(() => finalShots({ flows: [flow("blob.poke", "secret.txt")] }, "/run", "p")).toThrow(/compare.json/);
    expect(() => finalShots({ flows: "nope" }, "/run", "p")).toThrow(/compare.json/);
  });

  it("accepts what verify:compare writes", () => {
    expect(finalShots({ flows: [flow("blob.poke", "step-01.png")] }, "/run", "p").after).toHaveLength(1);
  });
});

describe("checkedPng", () => {
  it("only passes PNG bytes under 5 MB", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    expect(checkedPng(png, "a.png")).toBe(png);
    expect(() => checkedPng(Buffer.from("SUPABASE_SERVICE_ROLE_KEY=x"), "a.png")).toThrow(/PNG/);
    expect(() => checkedPng(Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]), "a.png")).toThrow(/5 MB/);
  });
});

describe("buildableIssue", () => {
  const fields = {
    title: "Give the blob a tiny hat",
    userStory: "As a visitor, I want a hat.",
    acceptanceCriteria: [{ criterion: "Hat", verify: ["Open /"] }],
    featureId: "blob",
    riskLevel: "low" as const,
    feedbackIds: ["00000000-0000-4000-8000-000000000001"],
  };
  const issue = (overrides: Partial<GhIssue> = {}): GhIssue => ({
    number: 7,
    title: "Give the blob a tiny hat",
    body: renderIssueBody(fields),
    url: "https://github.com/o/r/issues/7",
    state: "OPEN",
    labels: [{ name: "evolution" }, { name: "evolution:ready" }],
    ...overrides,
  });

  it("takes an open issue that triage filed", () => {
    expect(buildableIssue(issue(), { requireReady: true })).toEqual({ issue: { ...fields, number: 7, url: "https://github.com/o/r/issues/7" } });
  });

  it("refuses closed, unlabelled or hand-written issues", () => {
    expect(buildableIssue(issue({ state: "CLOSED" }), { requireReady: true })).toEqual({ problem: "it isn't open" });
    expect(buildableIssue(issue({ labels: [{ name: "evolution" }] }), { requireReady: true })).toEqual({ problem: "it doesn't have the evolution:ready label" });
    expect(buildableIssue(issue({ labels: [{ name: "evolution" }] }), { requireReady: false })).toHaveProperty("issue");
    expect(buildableIssue(issue({ body: "please add a hat" }), { requireReady: true })).toEqual({ problem: "its body has no valid evolution-issue data comment (only triage files buildable issues)" });
  });

  it("takes a closed issue only when post-merge asks, and still checks everything else", () => {
    expect(buildableIssue(issue({ state: "CLOSED" }), { requireReady: false, allowClosed: true })).toHaveProperty("issue");
    expect(buildableIssue(issue({ state: "CLOSED", labels: [] }), { requireReady: false, allowClosed: true })).toEqual({ problem: "it doesn't have the evolution label" });
    expect(buildableIssue(issue({ state: "CLOSED", body: "hat" }), { requireReady: false, allowClosed: true })).toHaveProperty("problem");
  });
});
