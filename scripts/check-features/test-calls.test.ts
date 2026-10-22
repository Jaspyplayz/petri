import { describe, expect, it } from "vitest";
import { declaresATest, isE2eFixture, isVitest } from "./test-calls";

describe("declaresATest", () => {
  it.each([
    ['import { it } from "vitest";\nit("works", () => {});\n', isVitest],
    ['import { describe, test } from "vitest";\ndescribe("x", () => {\n  test("works", async () => {});\n});\n', isVitest],
    ['import { it as check } from "vitest";\ncheck("works", { timeout: 1 }, function () {});\n', isVitest],
    ['import { it } from "vitest";\nit.each([[1]])("x %s", () => {});\n', isVitest],
    ['import { test } from "vitest";\ntest.for([1])("x %s", () => {});\n', isVitest],
    ['import { expect, test } from "@/shared/testing/e2e-fixture";\ntest("x", async ({ page }) => {});\n', isE2eFixture],
    ['import { test } from "../../../shared/testing/e2e-fixture";\ntest("x", async () => {});\n', isE2eFixture],
  ])("finds the test in %s", (source, fromModule) => {
    expect(declaresATest(source, fromModule)).toBe(true);
  });

  it.each([
    ["no import", 'it("works", () => {});\n', isVitest],
    ["a local stand-in", 'function it(name: string, body: () => void) {}\nit("works", () => {});\n', isVitest],
    ["the name in a comment or string", 'import { it } from "vitest";\n// it("works", () => {})\nexport const note = \'it("x", () => {})\';\n', isVitest],
    ["an import with no call", 'import { it } from "vitest";\nexport { it };\n', isVitest],
    ["a call without a test body", 'import { it } from "vitest";\nit("works");\n', isVitest],
    ["a type-only import", 'import type { it } from "vitest";\nit("works", () => {});\n', isVitest],
    ["only a describe block", 'import { describe } from "vitest";\ndescribe("x", () => {});\n', isVitest],
    ["the wrong module", 'import { test } from "@playwright/test";\ntest("x", async () => {});\n', isE2eFixture],
    ["a skipped test", 'import { it } from "vitest";\nit.skip("works", () => {});\n', isVitest],
  ])("finds no test with %s", (_name, source, fromModule) => {
    expect(declaresATest(source, fromModule)).toBe(false);
  });
});
