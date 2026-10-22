import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

const files = {
  component: "src/features/blob/components/blob-creature.tsx",
  lib: "src/features/blob/lib/blob-state.ts",
  effects: "src/shared/ui/effects/use-mount-effect.ts",
  routePage: "src/app/page.tsx",
  env: "src/shared/env.ts",
  logSink: "src/shared/lib/log.ts",
  server: "src/features/feedback/server/handlers.ts",
  e2e: "src/features/blob/tests/blob.e2e.ts",
  e2eFixture: "src/shared/testing/e2e-fixture.ts",
  script: "scripts/new-feature.ts",
} as const;

async function problems(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? `inline-config: ${message.message}`);
}

beforeAll(async () => {
  await problems(files.lib, "export const warmUp = 1;\n");
}, 120_000);

describe("lint config bans", { timeout: 30_000 }, () => {
  it.each([
    ["any", files.lib, "export const value: any = 1;\n", "@typescript-eslint/no-explicit-any"],
    ["as unknown as", files.lib, "export const value = 1 as unknown as string;\n", "no-restricted-syntax"],
    ["@ts-ignore", files.lib, "// @ts-ignore\nexport const value: number = 1;\n", "@typescript-eslint/ban-ts-comment"],
    [
      "@ts-expect-error",
      files.lib,
      "// @ts-expect-error: a long enough description\nexport const value: number = 'a';\n",
      "@typescript-eslint/ban-ts-comment",
    ],
    [
      "useEffect import",
      files.component,
      '"use client";\nimport { useEffect } from "react";\nexport function useTitle(title: string): void {\n  useEffect(() => {\n    document.title = title;\n  }, [title]);\n}\n',
      "no-restricted-imports",
    ],
    [
      "React.useLayoutEffect",
      files.component,
      '"use client";\nimport * as React from "react";\nexport function useTitle(title: string): void {\n  React.useLayoutEffect(() => {\n    document.title = title;\n  }, [title]);\n}\n',
      "no-restricted-syntax",
    ],
    ["line comment", files.lib, "// as requested, I changed this\nexport const value = 1;\n", "petri/no-comments"],
    [
      "JSX comment",
      files.component,
      "export function Thing() {\n  return <div>{/* note */}</div>;\n}\n",
      "petri/no-comments",
    ],
    ["console", files.lib, 'export function shout(): void {\n  console.log("hi");\n}\n', "no-console"],
    ["process.env", files.lib, "export const mode = process.env.NODE_ENV;\n", "no-restricted-properties"],
    ["node:process import", files.lib, 'import { env } from "node:process";\nexport const mode = env.NODE_ENV;\n', "no-restricted-imports"],
    ["default export", files.lib, "const value = 1;\nexport default value;\n", "no-restricted-syntax"],
    ["export { x as default }", files.lib, "const value = 1;\nexport { value as default };\n", "no-restricted-syntax"],
    [
      "server file without server-only first",
      files.server,
      'import { z } from "zod";\nexport const schema = z.string();\n',
      "petri/server-only-first",
    ],
    [
      "e2e test importing test from @playwright/test",
      files.e2e,
      'import { test } from "@playwright/test";\ntest("x", async ({ page }) => {\n  await page.goto("/");\n});\n',
      "no-restricted-imports",
    ],
    [
      "floating promise",
      files.lib,
      "async function work(): Promise<void> {}\nexport function run(): void {\n  work();\n}\n",
      "@typescript-eslint/no-floating-promises",
    ],
    [
      "non-exhaustive switch",
      files.lib,
      'export function label(kind: "a" | "b"): string {\n  switch (kind) {\n    case "a":\n      return "A";\n  }\n  return "?";\n}\n',
      "@typescript-eslint/switch-exhaustiveness-check",
    ],
    [
      "a skipped unit test",
      "scripts/check-pr/glob.test.ts",
      'import { it } from "vitest";\nit.skip("x", () => {});\n',
      "no-restricted-syntax",
    ],
    [
      "a focused e2e describe",
      files.e2e,
      'import { test } from "@/shared/testing/e2e-fixture";\ntest.describe.only("x", () => {});\n',
      "no-restricted-syntax",
    ],
    [
      "an e2e test touching the console-error fixture",
      files.e2e,
      'import { test } from "@/shared/testing/e2e-fixture";\ntest("x", ({ problems }) => {\n  problems.splice(0);\n});\n',
      "no-restricted-syntax",
    ],
    [
      "a conditionally skipped e2e test",
      files.e2e,
      'import { test } from "@/shared/testing/e2e-fixture";\ntest("x", () => {\n  test.skip(true, "flaky");\n});\n',
      "no-restricted-syntax",
    ],
    [
      "non-interactive element with a click handler",
      files.component,
      "export function Thing({ onPick }: { readonly onPick: () => void }) {\n  return <div onClick={onPick}>pick</div>;\n}\n",
      "jsx-a11y/no-static-element-interactions",
    ],
  ])("%s is an error", async (_name, filePath, code, ruleId) => {
    expect(await problems(filePath, code)).toContain(ruleId);
  });

  it("inline eslint-disable comments have no effect and still fail lint", async () => {
    const found = await problems(files.script, '/* eslint-disable */\nexport const value: any = 1;\n');
    expect(found).toContain("@typescript-eslint/no-explicit-any");
    expect(found.some((problem) => problem.startsWith("inline-config:"))).toBe(true);
  });
});

describe("lint config allow-list", { timeout: 30_000 }, () => {
  it.each([
    [
      "effects in src/shared/ui/effects",
      files.effects,
      '"use client";\nimport { useEffect } from "react";\nexport function useTitle(title: string): void {\n  useEffect(() => {\n    document.title = title;\n  }, [title]);\n}\n',
    ],
    ["default export in a Next.js route file", files.routePage, "export default function Page() {\n  return <main />;\n}\n"],
    ["process.env in src/shared/env.ts", files.env, "export const mode = process.env.NODE_ENV;\n"],
    ["console in the log sink", files.logSink, 'export function shout(): void {\n  console.error("hi");\n}\n'],
    ["a license header", files.lib, "/*! @license MIT */\nexport const value = 1;\n"],
    [
      "server file starting with server-only",
      files.server,
      'import "server-only";\nimport { z } from "zod";\nexport const schema = z.string();\n',
    ],
    ["@playwright/test in the e2e fixture", files.e2eFixture, 'import { test } from "@playwright/test";\nexport { test };\n'],
    ["comments and console in scripts/", files.script, '// a CLI note\nconsole.log("done");\n'],
  ])("%s is allowed", async (_name, filePath, code) => {
    expect(await problems(filePath, code)).toEqual([]);
  });
});
