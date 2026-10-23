import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

const files = {
  component: "src/features/blob/components/blob-creature.tsx",
  lib: "src/features/blob/lib/blob-state.ts",
  unitTest: "src/features/blob/tests/blob-state.test.ts",
  effects: "src/shared/ui/effects/use-mount-effect.ts",
  routePage: "src/app/page.tsx",
  env: "src/shared/env.ts",
  logSink: "src/shared/lib/log.ts",
  server: "src/features/feedback/server/handlers.ts",
  e2e: "src/features/blob/tests/blob.e2e.ts",
  e2eFixture: "src/shared/testing/e2e-fixture.ts",
  e2eFixtureSelfTest: "src/shared/testing/e2e-fixture.e2e.ts",
  script: "scripts/new-feature.ts",
  scriptTest: "scripts/check-pr/glob.test.ts",
  hookTest: ".claude/hooks/lib/commands.test.ts",
} as const;

const messages = {
  skipped: "no-restricted-syntax: Do not skip or focus tests.",
  effects: "no-restricted-syntax: Effects live only in src/shared/ui/effects/.",
  fixture: "no-restricted-syntax: The console-error fixture belongs to the harness.",
  harness: "no-restricted-syntax: Use the page and context fixtures from @/shared/testing/e2e-fixture.",
  playwrightImport: "no-restricted-imports: '@playwright/test' import is restricted from being used by a pattern. Import `test` and `expect`",
  dynamicImport: "no-restricted-syntax: Import restricted modules statically",
  defaultExport: "no-restricted-syntax: Use named exports.",
} as const;

const fixtureImport = 'import { test } from "@/shared/testing/e2e-fixture";\n';

async function problems(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => `${message.ruleId ?? "inline-config"}: ${message.message}`);
}

beforeAll(async () => {
  await problems(files.lib, "export const warmUp = 1;\n");
}, 120_000);

describe("lint config bans", { timeout: 30_000 }, () => {
  it.each([
    ["any", files.lib, "export const value: any = 1;\n", "@typescript-eslint/no-explicit-any: Unexpected any."],
    ["as unknown as", files.lib, "export const value = 1 as unknown as string;\n", "no-restricted-syntax: `as unknown as` bypasses"],
    ["@ts-ignore", files.lib, "// @ts-ignore\nexport const value: number = 1;\n", '@typescript-eslint/ban-ts-comment: Use "@ts-expect-error" instead of "@ts-ignore"'],
    [
      "@ts-expect-error",
      files.lib,
      "// @ts-expect-error: a long enough description\nexport const value: number = 'a';\n",
      '@typescript-eslint/ban-ts-comment: Do not use "@ts-expect-error"',
    ],
    [
      "useEffect import",
      files.component,
      '"use client";\nimport { useEffect } from "react";\nexport function useTitle(title: string): void {\n  useEffect(() => {\n    document.title = title;\n  }, [title]);\n}\n',
      "no-restricted-imports: 'useEffect' import from 'react' is restricted. Effects live only in src/shared/ui/effects/.",
    ],
    [
      "React.useLayoutEffect",
      files.component,
      '"use client";\nimport * as React from "react";\nexport function useTitle(title: string): void {\n  React.useLayoutEffect(() => {\n    document.title = title;\n  }, [title]);\n}\n',
      messages.effects,
    ],
    [
      "a namespace import of react",
      files.component,
      'import * as React from "react";\nexport const Fragment = React.Fragment;\n',
      "no-restricted-syntax: Import React APIs by name",
    ],
    [
      "a default import of react",
      files.component,
      'import React from "react";\nexport const Fragment = React.Fragment;\n',
      "no-restricted-syntax: Import React APIs by name",
    ],
    [
      "useEffect destructured from an object",
      files.component,
      '"use client";\nimport { hooks } from "@/shared/lib/hooks";\nconst { useEffect } = hooks;\nexport const run = useEffect;\n',
      messages.effects,
    ],
    [
      "useInsertionEffect read by a string key",
      files.component,
      '"use client";\nimport { hooks } from "@/shared/lib/hooks";\nexport const run = hooks["useInsertionEffect"];\n',
      messages.effects,
    ],
    ["a dynamic import of react", files.component, 'export const react = import("react");\n', messages.dynamicImport],
    ["a dynamic import by a computed path", files.lib, "export function load(name: string) {\n  return import(name);\n}\n", messages.dynamicImport],
    ["line comment", files.lib, "// as requested, I changed this\nexport const value = 1;\n", "petri/no-comments: No comments in src/."],
    [
      "JSX comment",
      files.component,
      "export function Thing() {\n  return <div>{/* note */}</div>;\n}\n",
      "petri/no-comments: No comments in src/.",
    ],
    ["console", files.lib, 'export function shout(): void {\n  console.log("hi");\n}\n', "no-console: Unexpected console statement."],
    [
      "globalThis.console",
      files.lib,
      'export function shout(): void {\n  globalThis.console.log("hi");\n}\n',
      "no-restricted-globals: Unexpected use of 'console'. Log through src/shared/lib/log.ts.",
    ],
    [
      "window.console",
      files.component,
      'export function shout(): void {\n  window["console"].log("hi");\n}\n',
      "no-restricted-globals: Unexpected use of 'console'. Log through src/shared/lib/log.ts.",
    ],
    [
      "console passed around",
      files.lib,
      "export const sink = console;\n",
      "no-restricted-globals: Unexpected use of 'console'. Log through src/shared/lib/log.ts.",
    ],
    ["console destructured from globalThis", files.lib, "export const { console: sink } = globalThis;\n", "no-restricted-syntax: Log through src/shared/lib/log.ts."],
    [
      "process.env",
      files.lib,
      "export const mode = process.env.NODE_ENV;\n",
      "no-restricted-properties: 'process.env' is restricted from being used. Read environment variables only in src/shared/env.ts",
    ],
    [
      "globalThis.process",
      files.lib,
      "export const mode = globalThis.process.env.NODE_ENV;\n",
      "no-restricted-globals: Unexpected use of 'process'. Read environment variables only in src/shared/env.ts",
    ],
    [
      "node:process import",
      files.lib,
      'import { env } from "node:process";\nexport const mode = env.NODE_ENV;\n',
      "no-restricted-imports: 'node:process' import is restricted from being used. Read environment variables only in src/shared/env.ts",
    ],
    ["default export", files.lib, "const value = 1;\nexport default value;\n", messages.defaultExport],
    ["export { x as default }", files.lib, "const value = 1;\nexport { value as default };\n", messages.defaultExport],
    [
      "server file without server-only first",
      files.server,
      'import { z } from "zod";\nexport const schema = z.string();\n',
      'petri/server-only-first: Server-only module: make `import "server-only";` the first statement',
    ],
    [
      "floating promise",
      files.lib,
      "async function work(): Promise<void> {}\nexport function run(): void {\n  work();\n}\n",
      "@typescript-eslint/no-floating-promises: Promises must be awaited",
    ],
    [
      "non-exhaustive switch",
      files.lib,
      'export function label(kind: "a" | "b"): string {\n  switch (kind) {\n    case "a":\n      return "A";\n  }\n  return "?";\n}\n',
      "@typescript-eslint/switch-exhaustiveness-check: Switch is not exhaustive",
    ],
    ["a skipped unit test", files.scriptTest, 'import { it } from "vitest";\nit.skip("x", () => {});\n', messages.skipped],
    ["an expected-to-fail unit test", files.unitTest, 'import { it } from "vitest";\nit.fails("x", () => {});\n', messages.skipped],
    [
      "a test skipped through its context",
      files.unitTest,
      'import { it } from "vitest";\nit("x", (context) => {\n  context.skip();\n});\n',
      messages.skipped,
    ],
    [
      "skip destructured from the test context",
      files.scriptTest,
      'import { it } from "vitest";\nit("x", ({ skip }) => {\n  skip();\n});\n',
      messages.skipped,
    ],
    [
      "a hook test skipped through its context",
      files.hookTest,
      'import { it } from "vitest";\nit("x", (context) => {\n  context.skip();\n});\n',
      messages.skipped,
    ],
    ["a focused e2e describe", files.e2e, `${fixtureImport}test.describe.only("x", () => {});\n`, messages.skipped],
    [
      "a conditionally skipped e2e test",
      files.e2e,
      `${fixtureImport}test("x", () => {\n  test.skip(true, "flaky");\n});\n`,
      messages.skipped,
    ],
    ["an expected-to-fail e2e test", files.e2e, `${fixtureImport}test("x", () => {\n  test.fail();\n});\n`, messages.skipped],
    [
      "an e2e test skipped through testInfo",
      files.e2e,
      `${fixtureImport}test("x", () => {\n  test.info().fixme();\n});\n`,
      messages.skipped,
    ],
    [
      "e2e test importing test from @playwright/test",
      files.e2e,
      'import { test } from "@playwright/test";\ntest("x", async ({ page }) => {\n  await page.goto("/");\n});\n',
      messages.playwrightImport,
    ],
    [
      "e2e test with a default import of @playwright/test",
      files.e2e,
      'import playwright from "@playwright/test";\nplaywright.test("x", async ({ page }) => {\n  await page.goto("/");\n});\n',
      messages.playwrightImport,
    ],
    [
      "an e2e test touching the console-error fixture",
      files.e2e,
      `${fixtureImport}test("x", ({ problems }) => {\n  problems.splice(0);\n});\n`,
      messages.fixture,
    ],
    [
      "an e2e test reading the fixture through its argument",
      files.e2e,
      `${fixtureImport}test("x", (fixtures) => {\n  fixtures.problems.splice(0);\n});\n`,
      messages.fixture,
    ],
    [
      "an e2e test replacing the console-error fixture",
      files.e2e,
      `${fixtureImport}const quiet = test.extend({ problems: async ({}, use) => {\n  await use([]);\n} });\nquiet("x", () => {});\n`,
      messages.fixture,
    ],
    [
      "an e2e test extending the fixture",
      files.e2e,
      `${fixtureImport}export const other = test.extend({});\n`,
      messages.harness,
    ],
    [
      "an e2e test removing the console listeners",
      files.e2e,
      `${fixtureImport}test("x", ({ page }) => {\n  page.removeAllListeners("console");\n});\n`,
      messages.harness,
    ],
    [
      "an e2e test opening another browser context",
      files.e2e,
      `${fixtureImport}test("x", async ({ page }) => {\n  await page.context().browser()?.newContext();\n});\n`,
      messages.harness,
    ],
    [
      "an e2e test using the browser fixture",
      files.e2e,
      `${fixtureImport}test("x", async ({ browser }) => {\n  await browser.close();\n});\n`,
      messages.harness,
    ],
    [
      "non-interactive element with a click handler",
      files.component,
      "export function Thing({ onPick }: { readonly onPick: () => void }) {\n  return <div onClick={onPick}>pick</div>;\n}\n",
      "jsx-a11y/no-static-element-interactions: Avoid non-native interactive elements.",
    ],
  ])("%s is an error", async (_name, filePath, code, expected) => {
    expect(await problems(filePath, code)).toEqual(expect.arrayContaining([expect.stringContaining(expected)]));
  });

  it("inline eslint-disable comments have no effect and still fail lint", async () => {
    const found = await problems(files.script, '/* eslint-disable */\nexport const value: any = 1;\n');
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringContaining("@typescript-eslint/no-explicit-any: Unexpected any."),
        expect.stringContaining("inline-config: "),
      ]),
    );
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
    [
      "an expected failure in the fixture self-test",
      files.e2eFixtureSelfTest,
      `${fixtureImport.replace("@/shared/testing/e2e-fixture", "./e2e-fixture")}test("x", () => {\n  test.fail();\n});\n`,
    ],
    ["assert.fail in a unit test", files.unitTest, 'import { assert, it } from "vitest";\nit("x", () => {\n  assert.fail("unreachable");\n});\n'],
    ["named React imports", files.component, 'import { useState } from "react";\nexport const hook = useState;\n'],
    ["a static dynamic import", files.lib, 'export const load = () => import("./blob-state");\n'],
    ["comments and console in scripts/", files.script, '// a CLI note\nconsole.log("done");\n'],
  ])("%s is allowed", async (_name, filePath, code) => {
    expect(await problems(filePath, code)).toEqual([]);
  });
});
