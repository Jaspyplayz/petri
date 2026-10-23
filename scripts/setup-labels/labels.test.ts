import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { labelCommand, LOOP_LABELS } from "./labels";

const root = join(import.meta.dirname, "..", "..");
const names = LOOP_LABELS.map((label) => label.name);

function workflowLabels(): Set<string> {
  const dir = join(root, ".github", "workflows");
  const used = new Set<string>();
  for (const file of readdirSync(dir)) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const match of text.matchAll(/--(?:add-|remove-)?label\s+([\w:-]+)|label\.name == '([\w:-]+)'/g)) {
      const name = match[1] ?? match[2];
      if (name) used.add(name);
    }
  }
  return used;
}

describe("LOOP_LABELS", () => {
  it("has unique names and six-digit hex colours", () => {
    expect(new Set(names).size).toBe(names.length);
    for (const label of LOOP_LABELS) expect(label.color).toMatch(/^[0-9A-F]{6}$/);
  });

  it("covers the risk labels and the guardrails config's agent and human-only labels", () => {
    const config = loadGuardrailsConfig(root);
    const expected = ["risk:low", "risk:medium", "risk:high", ...config.agentPullRequests.labels, ...Object.values(config.humanOnlyLabels)];
    expect(names).toEqual(expect.arrayContaining(expected));
  });

  it("covers every label a workflow adds, removes or triggers on", () => {
    const used = workflowLabels();
    expect(used).toContain("evolution:ready");
    expect(names).toEqual(expect.arrayContaining([...used]));
  });
});

describe("labelCommand", () => {
  it("creates or updates the label with gh", () => {
    expect(labelCommand({ name: "risk:low", color: "C2E0C6", description: "low" })).toEqual([
      "label",
      "create",
      "risk:low",
      "--color",
      "C2E0C6",
      "--description",
      "low",
      "--force",
    ]);
  });
});
