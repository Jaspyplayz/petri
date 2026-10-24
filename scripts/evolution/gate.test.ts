import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_PATH, parseEvolutionConfig, readEvolutionConfig, type EvolutionConfig } from "./config";
import { gate, pauseState, type GateInput } from "./gate";

const root = join(import.meta.dirname, "..", "..");
const config = readEvolutionConfig(root);
const now = new Date("2026-11-01T12:00:00Z");
const quiet = { runs: 3, failed: 0, turns: 40, agentMinutes: 12, costUsd: 1 };

function input(overrides: Partial<GateInput> = {}): GateInput {
  return { workflow: "triage", enabled: "true", paused: undefined, now, config, openEvolutionPRs: 0, mergesToday: 0, weekUsage: quiet, ...overrides };
}

describe("the evolution config", () => {
  it("in the repo is valid and has the caps the spec asks for", () => {
    expect(config).toMatchObject({ maxIssuesPerTriage: 3, maxOpenEvolutionPRs: 1, maxMergesPerDay: 6, minVotesToConsider: 2 });
    expect(config.trustLevel).toBeGreaterThanOrEqual(0);
  });

  it("rejects unknown keys, a level off the ladder and a model that isn't Claude", () => {
    const valid = readFileSync(join(root, CONFIG_PATH), "utf8");
    const edit = (change: (value: Record<string, unknown>) => void): string => {
      const value = JSON.parse(valid) as Record<string, unknown>;
      change(value);
      return JSON.stringify(value);
    };
    expect(() => parseEvolutionConfig(edit((value) => (value.autoMergeEverything = true)))).toThrow(/invalid/);
    expect(() => parseEvolutionConfig(edit((value) => (value.trustLevel = 5)))).toThrow(/trustLevel/);
    expect(() => parseEvolutionConfig(edit((value) => ((value.models as EvolutionConfig["models"]).build = "gpt-9")))).toThrow(/models/);
  });
});

describe("pauseState", () => {
  it("is paused until a future date, and not after it", () => {
    expect(pauseState('{"until":"2026-11-02T00:00:00Z"}', now)).toEqual({ paused: true, reason: "paused until 2026-11-02T00:00:00.000Z" });
    expect(pauseState('{"until":"2026-10-31T00:00:00Z"}', now).paused).toBe(false);
  });

  it("stays paused for null, junk or a missing until, and isn't paused without the file", () => {
    expect(pauseState('{"until":null}', now).paused).toBe(true);
    expect(pauseState("paused!", now).paused).toBe(true);
    expect(pauseState("{}", now).paused).toBe(true);
    expect(pauseState(undefined, now).paused).toBe(false);
  });
});

describe("gate", () => {
  it("is closed unless EVOLUTION_ENABLED is exactly true", () => {
    expect(gate(input({ enabled: undefined })).open).toBe(false);
    expect(gate(input({ enabled: "TRUE" })).open).toBe(false);
    expect(gate(input()).open).toBe(true);
  });

  it("is closed while paused, for every workflow but the postmortem", () => {
    for (const workflow of ["triage", "build", "verify", "automerge"] as const) {
      expect(gate(input({ workflow, paused: '{"until":null}' })).open).toBe(false);
    }
  });

  it("opens the postmortem whenever EVOLUTION_ENABLED is true, paused, over budget or not", () => {
    const over = { ...quiet, turns: config.weeklyBudget.turns + 1 };
    expect(gate(input({ workflow: "postmortem", paused: '{"until":null}', weekUsage: over })).open).toBe(true);
    expect(gate(input({ workflow: "postmortem", enabled: undefined })).open).toBe(false);
  });

  it("closes build at maxOpenEvolutionPRs and automerge at maxMergesPerDay", () => {
    expect(gate(input({ workflow: "build", openEvolutionPRs: 1 }))).toEqual({ open: false, reason: "1 evolution PR(s) open; maxOpenEvolutionPRs is 1" });
    expect(gate(input({ workflow: "build", openEvolutionPRs: 0 })).open).toBe(true);
    expect(gate(input({ workflow: "automerge", mergesToday: 6 })).open).toBe(false);
    expect(gate(input({ workflow: "automerge", mergesToday: 5 })).open).toBe(true);
    expect(gate(input({ workflow: "triage", openEvolutionPRs: 9, mergesToday: 9 })).open).toBe(true);
  });

  it("closes triage and build over the weekly budget, or when the usage wasn't read, and leaves verify and automerge alone", () => {
    const busy = { ...quiet, turns: config.weeklyBudget.turns };
    for (const workflow of ["triage", "build"] as const) {
      expect(gate(input({ workflow, weekUsage: busy })).reason).toMatch(/^over the weekly budget/);
      expect(gate(input({ workflow, weekUsage: { ...quiet, agentMinutes: config.weeklyBudget.agentMinutes } })).open).toBe(false);
      expect(gate(input({ workflow, weekUsage: undefined }))).toEqual({ open: false, reason: "the weekly agent usage wasn't read, so the budget can't be checked" });
    }
    for (const workflow of ["verify", "automerge"] as const) {
      expect(gate(input({ workflow, weekUsage: busy })).open).toBe(true);
      expect(gate(input({ workflow, weekUsage: undefined })).open).toBe(true);
    }
  });

  it("closes triage when it may create no issues", () => {
    expect(gate(input({ config: { ...config, maxIssuesPerTriage: 0 } })).open).toBe(false);
  });
});
