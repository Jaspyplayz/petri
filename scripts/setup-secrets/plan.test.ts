import { describe, expect, it } from "vitest";
import { commandFor, describeAction, envSetupTemplate, parseEnvFile, planSetup, SECRET_SPECS, type SecretSpec } from "./plan";

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

  it("accepts a blank GitHub-only secret that already exists in GitHub, and leaves it untouched", () => {
    const githubOnly: readonly SecretSpec[] = [
      { key: "GH", required: true, how: "", github: "secret" },
      { key: "BOTH", required: true, how: "", github: "secret", vercel: ["production"] },
    ];
    const plan = planSetup(new Map(), githubOnly, new Set(["GH", "BOTH"]));
    expect(plan.keptExisting.map((spec) => spec.key)).toEqual(["GH"]);
    expect(plan.missingRequired.map((spec) => spec.key)).toEqual(["BOTH"]);
    expect(plan.actions).toEqual([]);
    expect(planSetup(new Map([["GH", "new"]]), githubOnly, new Set(["GH"])).actions.map(describeAction)).toContain(
      "GitHub secret    GH",
    );
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

describe("commandFor", () => {
  it("passes every value through stdin, never on the command line", () => {
    const value = 'evil" & calc.exe | echo "pwned';
    const plan = planSetup(new Map(SECRET_SPECS.map((spec) => [spec.key, value])));
    expect(plan.actions.length).toBeGreaterThan(0);
    for (const action of plan.actions) {
      const command = commandFor(action);
      expect(command.stdin).toBe(value);
      expect(command.args.join(" ")).not.toContain(value);
      for (const arg of command.args) expect(arg).toMatch(/^[A-Za-z0-9_-]+$|^--[a-z-]+$/);
    }
  });

  it("states the Vercel env type explicitly, so the CLI never stops to ask", () => {
    const base = { kind: "vercel-env", key: "K", value: "v", environment: "preview" } as const;
    expect(commandFor({ ...base, sensitive: true }).args).toEqual(["env", "add", "K", "--environment", "preview", "--sensitive", "--force", "--yes"]);
    expect(commandFor({ ...base, sensitive: false }).args).toEqual([
      "env",
      "add",
      "K",
      "--environment",
      "preview",
      "--type",
      "config",
      "--force",
      "--yes",
    ]);
  });
});

describe("preview deployments", () => {
  it("never receive the service-role key or the rate-limit salt", () => {
    const plan = planSetup(new Map(SECRET_SPECS.map((spec) => [spec.key, "x"])));
    const previewKeys = plan.actions.flatMap((action) =>
      action.kind === "vercel-env" && action.environment === "preview" ? [action.key] : [],
    );
    expect(previewKeys).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(previewKeys).not.toContain("RATE_LIMIT_SALT");
    expect(previewKeys).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("envSetupTemplate", () => {
  it("lists every key with instructions", () => {
    const template = envSetupTemplate();
    for (const spec of SECRET_SPECS) expect(template).toContain(`${spec.key}=`);
  });
});
