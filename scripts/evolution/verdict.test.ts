import { describe, expect, it } from "vitest";
import { finalVerdict, planFiles, planJsonSchema, renderVerdictComment, VERDICT_MARKER, verdictJsonSchema, verdictSchema, verifyPlanSchema, type Verdict } from "./verdict";

const plan = {
  scripts: [
    { criterion: 1, name: "hat-visible", description: "The blob wears a hat", steps: [{ action: "goto", path: "/" }, { action: "expectVisible", target: "blob-hat" }] },
    { criterion: 2, name: "hat-after-poke", description: "The hat stays on", steps: [{ action: "click", target: "blob-poke-button" }] },
  ],
};

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    verdict: "pass",
    summary: "The hat shows and stays on.",
    criteria: [
      { criterion: 1, score: 9, passed: true, evidence: ["01-c1-hat-visible/step-02.png"], note: "Hat visible" },
      { criterion: 2, score: 8, passed: true, evidence: [], note: "Still there" },
    ],
    scopeCreep: { found: false, note: "Only the blob changed." },
    ...overrides,
  };
}

describe("verifyPlanSchema and planFiles", () => {
  it("accepts verify steps and writes one script per entry", () => {
    const parsed = verifyPlanSchema.parse(plan);
    const files = planFiles(parsed, 2);
    expect(files.map((f) => f.file)).toEqual(["01-c1-hat-visible.json", "02-c2-hat-after-poke.json"]);
    expect(files[0]?.json).toContain('"Criterion 1: The blob wears a hat"');
    expect(files[1]?.json).toContain('"blob-poke-button"');
  });

  it("rejects steps verify can't run and names that aren't file-safe", () => {
    expect(verifyPlanSchema.safeParse({ scripts: [{ ...plan.scripts[0], steps: [{ action: "eval", code: "x" }] }] }).success).toBe(false);
    expect(verifyPlanSchema.safeParse({ scripts: [{ ...plan.scripts[0], name: "../../x" }] }).success).toBe(false);
  });

  it("needs a script for every criterion and none for criteria the issue doesn't have", () => {
    const parsed = verifyPlanSchema.parse(plan);
    expect(() => planFiles(parsed, 3)).toThrow(/no script for criteria 3/);
    expect(() => planFiles(parsed, 1)).toThrow(/criteria the issue doesn't have: 2/);
  });

  it("are available as JSON Schemas without $schema", () => {
    expect(JSON.parse(planJsonSchema())).not.toHaveProperty("$schema");
    expect(JSON.parse(verdictJsonSchema())).toMatchObject({ type: "object" });
  });
});

describe("finalVerdict", () => {
  it("passes when the judge passes every criterion and finds no scope creep", () => {
    expect(finalVerdict(verdict(), 2)).toEqual({ passed: true, reasons: [] });
  });

  it("fails on a failed or missing criterion, scope creep, or a fail verdict, even if the judge says pass", () => {
    const [first, second] = verdict().criteria;
    if (first === undefined || second === undefined) throw new Error("fixture");
    expect(finalVerdict(verdict({ criteria: [first, { ...second, passed: false, score: 3 }] }), 2).reasons).toEqual(["criterion 2 failed (score 3/10)"]);
    expect(finalVerdict(verdict({ criteria: [first] }), 2).reasons).toEqual(["criterion 2 wasn't scored"]);
    expect(finalVerdict(verdict({ scopeCreep: { found: true, note: "also changed feedback" } }), 2).passed).toBe(false);
    expect(finalVerdict(verdict({ verdict: "fail" }), 2).passed).toBe(false);
  });

  it("rejects evidence paths that aren't plain relative paths", () => {
    const [first] = verdict().criteria;
    if (first === undefined) throw new Error("fixture");
    expect(verdictSchema.safeParse(verdict({ criteria: [{ ...first, evidence: ["![x](https://evil)"] }] })).success).toBe(false);
  });
});

describe("renderVerdictComment", () => {
  it("is a sticky comment with one row per criterion and the reasons it fails", () => {
    const body = renderVerdictComment({
      verdict: verdict({ summary: "ok @octocat" }),
      criteria: ["The blob wears a hat", "The hat | stays"],
      passed: false,
      reasons: ["the diff does more than the issue asked for"],
      runUrl: "https://github.com/o/r/actions/runs/1",
      sha: "a".repeat(40),
    });
    expect(body.startsWith(VERDICT_MARKER)).toBe(true);
    expect(body).toContain("## evolution-verify: ❌ fail");
    expect(body).toContain("| 2 | The hat \\| stays | 8/10 | pass | Still there |");
    expect(body).toContain("ok @​octocat");
    expect(body).toContain("- the diff does more than the issue asked for");
  });
});
