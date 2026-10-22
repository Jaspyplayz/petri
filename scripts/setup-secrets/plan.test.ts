import { describe, expect, it } from "vitest";
import { describeAction, envSetupTemplate, parseEnvFile, planSetup, SECRET_SPECS, type SecretSpec } from "./plan";

describe("parseEnvFile", () => {
  it("parses keys, quotes, comments and export prefixes", () => {
    const parsed = parseEnvFile(
      ["# comment", "", "A=1", 'B="two words"', "C='x=y'", "export D=4", "E=5 # trailing", "lower=no", "F="].join("\n"),
    );
    expect(Object.fromEntries(parsed)).toEqual({ A: "1", B: "two words", C: "x=y", D: "4", E: "5", F: "" });
  });

  it("handles CRLF line endings", () => {
    expect(parseEnvFile("A=1\r\nB=2\r\n").get("B")).toBe("2");
  });
});

describe("planSetup", () => {
  const specs: readonly SecretSpec[] = [
    { key: "REQ", required: true, how: "", github: "secret", vercel: ["production", "preview"], vercelSensitive: true },
    { key: "VAR", required: false, how: "", github: "variable" },
    { key: "OPT", required: false, how: "", github: "secret" },
    { key: "GEN", required: true, how: "", vercel: ["production"], generate: () => "generated-value" },
  ];

  it("fans each value out to its targets", () => {
    const plan = planSetup(new Map([["REQ", "r"], ["VAR", "v"]]), specs);
    expect(plan.actions.map(describeAction)).toEqual([
      "GitHub secret    REQ",
      "Vercel env       REQ (production, sensitive)",
      "Vercel env       REQ (preview, sensitive)",
      "GitHub variable  VAR",
      "Vercel env       GEN (production)",
    ]);
    expect(plan.skippedOptional.map((spec) => spec.key)).toEqual(["OPT"]);
    expect(plan.missingRequired).toEqual([]);
  });

  it("generates blank generatable values and keeps provided ones", () => {
    expect(planSetup(new Map([["REQ", "r"]]), specs).generated.get("GEN")).toBe("generated-value");
    expect(planSetup(new Map([["REQ", "r"], ["GEN", "mine"]]), specs).generated.size).toBe(0);
  });

  it("reports missing required values", () => {
    expect(planSetup(new Map(), specs).missingRequired.map((spec) => spec.key)).toEqual(["REQ"]);
  });

  it("never exposes service-role or auth tokens as public Vercel config", () => {
    for (const spec of SECRET_SPECS) {
      if (/SERVICE_ROLE|TOKEN|SALT/.test(spec.key) && spec.vercel) {
        expect(spec.vercelSensitive, spec.key).toBe(true);
      }
      if (spec.key.startsWith("NEXT_PUBLIC_")) {
        expect(spec.key).not.toMatch(/SERVICE|SECRET|TOKEN/);
      }
    }
  });
});

describe("envSetupTemplate", () => {
  it("lists every key with instructions", () => {
    const template = envSetupTemplate();
    for (const spec of SECRET_SPECS) expect(template).toContain(`${spec.key}=`);
  });
});
