import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import type { ChangedFile } from "./git";
import { type FileReader, protectedPathViolations, trustLevelAt } from "./protected-paths";

const config = loadGuardrailsConfig(repoRoot);

function reader(files: { readonly base?: Record<string, string>; readonly head?: Record<string, string> }): FileReader {
  return (side, path) => (side === "base" ? files.base : files.head)?.[path];
}

const noFiles = reader({});

function violations(changes: readonly ChangedFile[], read: FileReader = noFiles): string[] {
  return protectedPathViolations(changes, config, read).map((violation) => violation.path);
}

describe("protectedPathViolations", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".github/guardrails.json",
    ".evolution/prompts/triage.md",
    "CLAUDE.md",
    "AGENTS.md",
    ".claude/settings.json",
    ".claude/hooks/pre-tool-use.ts",
    "eslint.config.mjs",
    "lint-rules/index.mjs",
    "tsconfig.json",
    ".dependency-cruiser.cjs",
    "scripts/check-protected-paths.ts",
    "scripts/check-pr/glob.ts",
    "lefthook.yml",
    ".gitleaks.toml",
    "vitest.config.ts",
    "playwright.config.ts",
    "src/shared/testing/e2e-fixture.ts",
    "src/shared/ui/effects/use-mount-effect.ts",
    "src/shared/env.ts",
    "src/shared/lib/log.ts",
    "src/instrumentation.ts",
    "pnpm-workspace.yaml",
    "vercel.json",
  ])("blocks agent edits to %s", (path) => {
    expect(violations([{ path, status: "modified" }])).toEqual([path]);
  });

  it.each(["src/features/blob/components/blob-creature.tsx", "src/shared/ui/button.tsx", "docs/decisions.md", "scripts/new-feature.ts", "pnpm-lock.yaml"])(
    "allows %s",
    (path) => {
      expect(violations([{ path, status: "modified" }])).toEqual([]);
    },
  );

  it("blocks deleting a guardrail", () => {
    expect(violations([{ path: "scripts/check-features.ts", status: "deleted" }])).toEqual(["scripts/check-features.ts"]);
  });

  describe("package.json", () => {
    const base = JSON.stringify({ name: "petri", scripts: { lint: "eslint" }, dependencies: { zod: "4.0.0" } });

    it("allows dependency-only changes", () => {
      const head = JSON.stringify({ name: "petri", scripts: { lint: "eslint" }, dependencies: { zod: "4.1.0", ms: "2.0.0" } });
      expect(violations([{ path: "package.json", status: "modified" }], reader({ base: { "package.json": base }, head: { "package.json": head } }))).toEqual([]);
    });

    it("blocks script changes", () => {
      const head = JSON.stringify({ name: "petri", scripts: { lint: "echo ok" }, dependencies: { zod: "4.0.0" } });
      expect(
        violations([{ path: "package.json", status: "modified" }], reader({ base: { "package.json": base }, head: { "package.json": head } })),
      ).toEqual(["package.json"]);
    });

    it.each([
      ["a guardrail toolchain package", { zod: "4.0.0", eslint: "8.0.0" }],
      ["a scoped toolchain package", { zod: "4.0.0", "@typescript-eslint/parser": "1.0.0" }],
      ["an npm: alias", { zod: "npm:not-zod@1.0.0" }],
      ["a git dependency", { zod: "github:someone/zod" }],
      ["a local file", { zod: "file:../zod" }],
      ["a tarball URL", { zod: "https://example.com/zod.tgz" }],
    ])("blocks %s", (_name, dependencies) => {
      const head = JSON.stringify({ name: "petri", scripts: { lint: "eslint" }, dependencies });
      expect(
        violations([{ path: "package.json", status: "modified" }], reader({ base: { "package.json": base }, head: { "package.json": head } })),
      ).toEqual(["package.json"]);
    });

    it("allows registry ranges and removing a dependency", () => {
      const head = JSON.stringify({ name: "petri", scripts: { lint: "eslint" }, dependencies: { ms: "^2.1.0 || 3.x", clsx: ">=2 <3" } });
      expect(violations([{ path: "package.json", status: "modified" }], reader({ base: { "package.json": base }, head: { "package.json": head } }))).toEqual([]);
    });

    it("blocks unparseable package.json", () => {
      expect(
        violations([{ path: "package.json", status: "modified" }], reader({ base: { "package.json": base }, head: { "package.json": "{" } })),
      ).toEqual(["package.json"]);
    });
  });

  describe("trust config", () => {
    const at = (trustLevel: number, extra: Record<string, unknown> = {}) =>
      JSON.stringify({ trustLevel, maxMergesPerDay: 6, ...extra });
    const change: ChangedFile[] = [{ path: ".evolution/config.json", status: "modified" }];

    it("allows lowering trust and nothing else", () => {
      expect(violations(change, reader({ base: { ".evolution/config.json": at(2) }, head: { ".evolution/config.json": at(1) } }))).toEqual([]);
    });

    it.each([
      ["raising trust", at(1), at(2)],
      ["keeping trust", at(1), at(1)],
      ["lowering trust while raising a cap", at(2), at(1, { maxMergesPerDay: 60 })],
      ["a non-integer level", at(2), at(1.5)],
    ])("blocks %s", (_name, before, after) => {
      expect(violations(change, reader({ base: { ".evolution/config.json": before }, head: { ".evolution/config.json": after } }))).toEqual([
        ".evolution/config.json",
      ]);
    });

    it("blocks creating or deleting the config", () => {
      expect(violations([{ path: ".evolution/config.json", status: "added" }], reader({ head: { ".evolution/config.json": at(4) } }))).toEqual([
        ".evolution/config.json",
      ]);
      expect(violations([{ path: ".evolution/config.json", status: "deleted" }])).toEqual([".evolution/config.json"]);
    });
  });

  describe("pause file", () => {
    const path = ".evolution/PAUSED";
    const until = (value: string | null) => JSON.stringify({ until: value });

    it("allows adding a pause", () => {
      expect(violations([{ path, status: "added" }], reader({ head: { [path]: until("2026-10-23T00:00:00Z") } }))).toEqual([]);
    });

    it.each([
      ["extending", until("2026-10-23T00:00:00Z"), until("2026-10-24T00:00:00Z"), []],
      ["making it indefinite", until("2026-10-23T00:00:00Z"), until(null), []],
      ["shortening", until("2026-10-24T00:00:00Z"), until("2026-10-23T00:00:00Z"), [path]],
      ["ending an indefinite pause", until(null), until("2026-10-23T00:00:00Z"), [path]],
      ["breaking the file", until(null), "nope", [path]],
    ])("%s an existing pause", (_name, before, after, expected) => {
      expect(violations([{ path, status: "modified" }], reader({ base: { [path]: before }, head: { [path]: after } }))).toEqual(expected);
    });

    it("blocks removing the pause", () => {
      expect(violations([{ path, status: "deleted" }])).toEqual([path]);
    });
  });

  describe("migrations", () => {
    const migration: ChangedFile = { path: "supabase/migrations/0006_more.sql", status: "added" };
    const trust = (level: number) => reader({ base: { ".evolution/config.json": JSON.stringify({ trustLevel: level }) } });

    it("blocks new migrations below trust level 4", () => {
      expect(violations([migration], trust(3))).toEqual([migration.path]);
      expect(violations([migration])).toEqual([migration.path]);
    });

    it("allows new migrations from trust level 4, but never edits", () => {
      expect(violations([migration], trust(4))).toEqual([]);
      expect(violations([{ ...migration, status: "modified" }], trust(4))).toEqual([migration.path]);
    });

    it("reads the trust level from the base, not the PR", () => {
      const read = reader({
        base: { ".evolution/config.json": JSON.stringify({ trustLevel: 1 }) },
        head: { ".evolution/config.json": JSON.stringify({ trustLevel: 4 }) },
      });
      expect(trustLevelAt(read, config, "base")).toBe(1);
      expect(violations([migration], read)).toEqual([migration.path]);
    });
  });
});
