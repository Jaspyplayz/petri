import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readEvolutionConfig } from "./config";
import { budgetTotals, overBudget, parseAgentUsage, renderWeeklySummary, runStatus, totalsByWorkflow, windowStart, type AgentRunRow } from "./usage";

const budget = { turns: 100, agentMinutes: 60 };
const usage = { turns: 12, durationMs: 90_000, costUsd: 0.42, isError: false, subtype: "success" };

function run(workflow: string, turns: number | null, minutes: number | null, status = "pass", costUsd: unknown = 0.5): AgentRunRow {
  return { workflow, status, turns, duration_ms: minutes === null ? null : minutes * 60_000, details: { costUsd } };
}

describe("parseAgentUsage", () => {
  it("reads what the workflows' jq step writes", () => {
    expect(parseAgentUsage(JSON.stringify(usage))).toEqual(usage);
    expect(parseAgentUsage(JSON.stringify({ ...usage, costUsd: null }))?.costUsd).toBeNull();
  });

  it("returns undefined for nothing, junk, the all-null object jq writes for a log without a result, and absurd values", () => {
    for (const text of [undefined, "", "  ", "not json", "null", '{"turns":null,"durationMs":null,"costUsd":null,"isError":null,"subtype":null}']) {
      expect(parseAgentUsage(text), String(text)).toBeUndefined();
    }
    expect(parseAgentUsage(JSON.stringify({ ...usage, turns: -1 }))).toBeUndefined();
    expect(parseAgentUsage(JSON.stringify({ ...usage, turns: 5000 }))).toBeUndefined();
    expect(parseAgentUsage(JSON.stringify({ ...usage, durationMs: 7 * 3_600_000 }))).toBeUndefined();
    expect(parseAgentUsage(JSON.stringify({ ...usage, extra: 1 }))).toBeUndefined();
  });
});

describe("runStatus", () => {
  it("records nothing for an agent that never started", () => {
    expect(runStatus("skipped", undefined)).toBeUndefined();
  });

  it("is pass, fail or error from the result and the usage", () => {
    expect(runStatus("success", usage)).toBe("pass");
    expect(runStatus("failure", usage)).toBe("fail");
    expect(runStatus("success", { ...usage, isError: true, subtype: "error_max_turns" })).toBe("fail");
    expect(runStatus("failure", undefined)).toBe("error");
    expect(runStatus("cancelled", usage)).toBe("error");
  });
});

describe("totals and the budget", () => {
  const rows = [run("triage", 10, 2), run("build", 60, 30, "fail"), run("verify", 20, 5), run("verify", null, null, "error", "x"), run("post-merge", null, 4)];

  it("adds up the triage, build and verify agents and leaves other workflows out of the budget", () => {
    expect(budgetTotals(rows)).toEqual({ runs: 4, failed: 2, turns: 90, agentMinutes: 37, costUsd: 1.5 });
    expect(totalsByWorkflow(rows).get("post-merge")).toEqual({ runs: 1, failed: 0, turns: 0, agentMinutes: 4, costUsd: 0.5 });
  });

  it("counts only failed and errored runs as failed, not a guardian dry run that was skipped", () => {
    const guardian = [run("guardian", null, 1, "skipped"), run("guardian", null, 2, "fail"), run("guardian", null, 1, "error"), run("guardian", null, 1)];
    expect(totalsByWorkflow(guardian).get("guardian")).toMatchObject({ runs: 4, failed: 2 });
  });

  it("is over budget at either limit, and says which", () => {
    expect(overBudget(budgetTotals(rows), budget)).toBeUndefined();
    expect(overBudget({ ...budgetTotals(rows), turns: 100 }, budget)).toBe("over the weekly budget: the agents used 100 turns (budget 100) in the last 7 days");
    expect(overBudget({ ...budgetTotals(rows), turns: 150, agentMinutes: 61.4 }, budget)).toBe(
      "over the weekly budget: the agents used 150 turns (budget 100) and 61 agent minutes (budget 60) in the last 7 days",
    );
  });

  it("looks back 7 days", () => {
    expect(windowStart(new Date("2026-11-08T12:00:00Z")).toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("has a budget in the repo's config", () => {
    const { weeklyBudget } = readEvolutionConfig(join(import.meta.dirname, "..", ".."));
    expect(weeklyBudget.turns).toBeGreaterThan(0);
    expect(weeklyBudget.agentMinutes).toBeGreaterThan(0);
  });
});

describe("renderWeeklySummary", () => {
  const now = new Date("2026-11-08T12:00:00Z");

  it("shows each workflow, the budgeted total and the share of the budget", () => {
    const text = renderWeeklySummary([run("triage", 10, 2), run("build", 60, 30, "fail")], budget, now);
    expect(text).toContain("## Agent runs, 2026-11-01 12:00 to 2026-11-08 12:00 UTC");
    expect(text).toContain("| build | 1 | 1 | 60 | 30.0 | 0.50 |");
    expect(text).toContain("| **Budgeted (triage, build, verify, postmortem)** | 2 | 1 | 70 | 32.0 | 1.00 |");
    expect(text).toContain("turns 70 of 100 (70%), agent minutes 32 of 60 (53%)");
    expect(text).toContain("Under budget.");
  });

  it("says when the gates are closed, and renders an empty week", () => {
    expect(renderWeeklySummary([run("build", 120, 10)], budget, now)).toContain("**Over budget.** The triage and build gates stay closed");
    expect(renderWeeklySummary([], budget, now)).toContain("| (none) | 0 | 0 | 0 | 0.0 | 0.00 |");
  });
});
