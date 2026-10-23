import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gates, pnpmInvocation, summary } from "./gates";

const root = join(import.meta.dirname, "..", "..");

describe("gates", () => {
  it("are package.json scripts that CI runs too", () => {
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
    for (const gate of gates) {
      expect(scripts[gate.script], gate.script).toBeDefined();
      expect(ci, gate.script).toMatch(new RegExp(`run: pnpm ${gate.script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"));
    }
  });

  it("have unique names", () => {
    expect(new Set(gates.map((gate) => gate.name)).size).toBe(gates.length);
  });
});

describe("pnpmInvocation", () => {
  it("runs a JavaScript pnpm through node and a native pnpm directly", () => {
    expect(pnpmInvocation("/pnpm/bin/pnpm.cjs", ["lint"])).toEqual({ command: process.execPath, args: ["/pnpm/bin/pnpm.cjs", "lint"] });
    expect(pnpmInvocation("C:\\pnpm\\pnpm.exe", ["lint"])).toEqual({ command: "C:\\pnpm\\pnpm.exe", args: ["lint"] });
  });

  it("falls back to pnpm on PATH when it isn't run through pnpm", () => {
    expect(pnpmInvocation(undefined, ["lint"])).toEqual({ command: "pnpm", args: ["lint"] });
    expect(pnpmInvocation("", ["lint"])).toEqual({ command: "pnpm", args: ["lint"] });
  });
});

describe("summary", () => {
  const typecheck = { name: "typecheck", script: "typecheck" };
  const lint = { name: "lint", script: "lint" };
  const unit = { name: "unit", script: "test:coverage" };

  it("lists every gate and passes when all of them pass", () => {
    expect(
      summary([
        { gate: typecheck, ok: true, seconds: 3.04 },
        { gate: lint, ok: true, seconds: 12 },
      ]),
    ).toEqual({
      text: ["✔ typecheck (pnpm typecheck, 3.0 s)", "✔ lint (pnpm lint, 12.0 s)", "", "check: ok (2 gates)"].join("\n"),
      ok: true,
    });
  });

  it("names every failed gate", () => {
    const result = summary([
      { gate: typecheck, ok: false, seconds: 1 },
      { gate: lint, ok: true, seconds: 1 },
      { gate: unit, ok: false, seconds: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.text).toContain("✖ unit (pnpm test:coverage, 1.0 s)");
    expect(result.text).toContain("check: 2 of 3 gates failed: typecheck, unit.");
  });
});
