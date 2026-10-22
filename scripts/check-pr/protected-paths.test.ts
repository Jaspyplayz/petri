import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import type { ChangedFile } from "./git";
import { baseBranchViolation, type FileReader, isProtectedPath, protectedPathViolations, trustLevelAt } from "./protected-paths";

const config = loadGuardrailsConfig(repoRoot);

type Sides = { readonly base?: Record<string, string>; readonly tip?: Record<string, string>; readonly head?: Record<string, string> };

function reader(files: Sides): FileReader {
  return (side, path) => files[side]?.[path];
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
    ".pnpmfile.cjs",
    "patches/eslint.patch",
    "vercel.json",
    ".claude/settings.local.json",
    ".claude/CLAUDE.md",
    ".claude/skills/verify-app/SKILL.md",
    "CLAUDE.local.md",
    "docs/CLAUDE.md",
    "src/AGENTS.md",
    ".mcp.json",
    "STARTER_PROMPT.md",
    "next.config.ts",
    "scripts/new-feature.ts",
    "scripts/new-feature/templates.ts",
    "scripts/db-push-prod.ts",
    "lefthook-local.yml",
    ".lefthook.yml",
    ".config/lefthook.yml",
    ".gitattributes",
    "src/.gitattributes",
    ".gitleaksignore",
    "src/shared/server-env-schema.ts",
    "supabase/config.toml",
    "supabase/seed.sql",
  ])("blocks agent edits to %s", (path) => {
    expect(violations([{ path, status: "modified" }])).toEqual([path]);
  });

  it.each(["src/features/blob/components/blob-creature.tsx", "src/shared/ui/button.tsx", "docs/decisions.md", "docs/claude-notes.md"])(
    "allows %s",
    (path) => {
      expect(violations([{ path, status: "modified" }])).toEqual([]);
    },
  );

  it.each([".GITHUB/workflows/ci.yml", "ESLINT.config.mjs", ".Claude/Settings.json", "Package.json", "SCRIPTS/check-features.ts"])(
    "ignores case, so %s can't slip past on a case-insensitive checkout",
    (path) => {
      expect(isProtectedPath(path, config)).toBe(true);
      expect(violations([{ path, status: "modified" }])).toEqual([path]);
    },
  );

  it("blocks deleting a guardrail", () => {
    expect(violations([{ path: "scripts/check-features.ts", status: "deleted" }])).toEqual(["scripts/check-features.ts"]);
  });

  it.each(["package.json", "pnpm-lock.yaml"])("blocks even dependency-only changes to %s", (path) => {
    const base = JSON.stringify({ name: "petri", dependencies: { zod: "4.0.0" } });
    const head = JSON.stringify({ name: "petri", dependencies: { zod: "4.1.0" } });
    expect(violations([{ path, status: "modified" }], reader({ base: { [path]: base }, head: { [path]: head } }))).toEqual([path]);
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
    const trust = (level: number) => reader({ tip: { ".evolution/config.json": JSON.stringify({ trustLevel: level }) } });

    it("blocks new migrations below trust level 4", () => {
      expect(violations([migration], trust(3))).toEqual([migration.path]);
      expect(violations([migration])).toEqual([migration.path]);
    });

    it("allows new migrations from trust level 4, but never edits", () => {
      expect(violations([migration], trust(4))).toEqual([]);
      expect(violations([{ ...migration, status: "modified" }], trust(4))).toEqual([migration.path]);
    });

    it("reads the trust level from the base branch tip, not the merge base or the PR", () => {
      const level = (trustLevel: number) => ({ ".evolution/config.json": JSON.stringify({ trustLevel }) });
      const loweredOnMain = reader({ base: level(4), tip: level(1), head: level(4) });
      expect(trustLevelAt(loweredOnMain, config, "tip")).toBe(1);
      expect(violations([migration], loweredOnMain)).toEqual([migration.path]);
      expect(violations([migration], reader({ base: level(1), tip: level(4), head: level(1) }))).toEqual([]);
    });
  });
});

describe("baseBranchViolation", () => {
  it("lets agent PRs target only the default branch", () => {
    expect(baseBranchViolation("main", "main")).toBeUndefined();
    expect(baseBranchViolation("release", "main")?.reason).toContain("default branch (main)");
    expect(baseBranchViolation(undefined, "main")?.path).toBe("base branch (unknown)");
    expect(baseBranchViolation("main", undefined)).toBeDefined();
  });
});
