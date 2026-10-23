import { describe, expect, it } from "vitest";
import { defineFeature, type FeatureManifest } from "@/shared/lib/feature-manifest";
import { describeStep, flowNames, parseScript, resolveFlow, type VerifyStep } from "./steps";
import { VerifyError } from "./verify-error";

const counter = defineFeature({
  id: "counter",
  title: "Counter",
  summary: "Counts clicks.",
  routes: ["/"],
  uiLocation: "The home page.",
  howToReach: ["Open /"],
  keyboardShortcuts: [],
  selectors: { button: "counter-button", value: "counter-value" },
  flows: {
    increment: {
      description: "Clicking adds one.",
      steps: [
        { action: "goto", path: "/" },
        { action: "click", target: "button" },
        { action: "expectText", target: "value", text: "1" },
        { action: "screenshot", name: "after" },
      ],
    },
  },
  dataTables: [],
  owners: "agents",
  riskLevel: "low",
});

const empty: FeatureManifest = { ...counter, id: "empty", flows: {} };
const broken: FeatureManifest = {
  ...counter,
  id: "broken",
  flows: { typo: { description: "Uses a selector that isn't defined.", steps: [{ action: "click", target: "missing" }] } },
};

describe("resolveFlow", () => {
  it("swaps selector names for their data-testids", () => {
    expect(resolveFlow([counter], "counter.increment")).toEqual({
      name: "counter.increment",
      description: "Clicking adds one.",
      steps: [
        { action: "goto", path: "/" },
        { action: "click", target: "counter-button" },
        { action: "expectText", target: "counter-value", text: "1" },
        { action: "screenshot", name: "after" },
      ],
    });
  });

  it.each(["counter", "counter.nope", "nope.increment", "counter.increment.extra", ""])("rejects %j and lists the flows", (name) => {
    expect(() => resolveFlow([counter, empty], name)).toThrow(/Flows: counter\.increment$/);
  });

  it("rejects a flow that uses a selector the manifest doesn't define", () => {
    expect(() => resolveFlow([broken], "broken.typo")).toThrow("broken.typo uses a selector the manifest doesn't define: missing");
  });

  it("throws VerifyError so the CLI reports it as a usage error", () => {
    expect(() => resolveFlow([], "x.y")).toThrow(VerifyError);
    expect(() => resolveFlow([], "x.y")).toThrow("Flows: none");
  });
});

describe("flowNames", () => {
  it("lists every feature's flows as feature.flow", () => {
    expect(flowNames([counter, empty, broken])).toEqual(["counter.increment", "broken.typo"]);
  });
});

describe("parseScript", () => {
  const steps = [
    { action: "goto", path: "/feedback" },
    { action: "fill", target: "feedback-body-input", value: "hi" },
    { action: "press", target: "feedback-body-input", key: "Enter" },
    { action: "wait", ms: 200 },
  ];

  it("accepts a bare list of steps", () => {
    expect(parseScript("check", steps)).toEqual({ name: "check", description: "Ad-hoc verify script", steps });
  });

  it("accepts steps with a description", () => {
    expect(parseScript("check", { description: "Posting works", steps })).toEqual({ name: "check", description: "Posting works", steps });
  });

  it.each([
    ["an empty list", []],
    ["an unknown action", [{ action: "hover", target: "x" }]],
    ["a relative goto path", [{ action: "goto", path: "feedback" }]],
    ["a missing target", [{ action: "click" }]],
    ["an extra field", [{ action: "click", target: "x", force: true }]],
    ["a wait over 30 s", [{ action: "wait", ms: 60_000 }]],
    ["an object without steps", { description: "nothing" }],
  ])("rejects %s", (_label, json) => {
    expect(() => parseScript("check", json)).toThrow(/^check isn't a valid verify script:/);
  });
});

describe("describeStep", () => {
  it.each<[VerifyStep, string]>([
    [{ action: "goto", path: "/timeline" }, "goto /timeline"],
    [{ action: "click", target: "a" }, "click a"],
    [{ action: "fill", target: "a", value: "Gloop" }, 'fill a "Gloop"'],
    [{ action: "press", target: "a", key: "Enter" }, "press a Enter"],
    [{ action: "expectVisible", target: "a" }, "expectVisible a"],
    [{ action: "expectText", target: "a", text: "1" }, 'expectText a "1"'],
    [{ action: "screenshot", name: "after" }, "screenshot after"],
    [{ action: "wait", ms: 250 }, "wait 250ms"],
  ])("describes %j", (step, text) => {
    expect(describeStep(step)).toBe(text);
  });
});
