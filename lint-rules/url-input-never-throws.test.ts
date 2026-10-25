import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });
const rule = "petri/url-input-never-throws";
// Typed linting only parses files in the TypeScript project, so the fixtures borrow real files' paths.
const libFile = "src/features/feedback/lib/feedback-sort.ts";
const componentFile = "src/features/feedback/components/feedback-board.tsx";

async function ruleHits(filePath: string, code: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((message) => message.ruleId === rule).map((message) => message.line);
}

const parserFrom89 = `import type { FeedbackCategory } from "./feedback-status";

export const FEEDBACK_CATEGORIES = ["idea", "bug"] as const satisfies readonly FeedbackCategory[];

export function parseCategoryFilter(value: string | readonly string[] | undefined): FeedbackCategory | undefined {
  const candidate = typeof value === "object" ? value[0] : value;
  if (candidate === undefined || candidate === "") return undefined;
  const category = FEEDBACK_CATEGORIES.find((option) => option === candidate);
  if (category === undefined) throw new Error(\`feedback: unknown category filter "\${candidate}"\`);
  return category;
}
`;

beforeAll(async () => {
  await ruleHits(libFile, "export const warmUp = 1;\n");
}, 120_000);

describe(rule, { timeout: 30_000 }, () => {
  it("fails on the parser #89 shipped, which threw on an unknown ?category", async () => {
    expect(await ruleHits(libFile, parserFrom89)).toEqual([9]);
  });

  it("passes the sort parser on main, which falls back to a default", async () => {
    const code = readFileSync("src/features/feedback/lib/feedback-sort.ts", "utf8");
    expect(await ruleHits("src/features/feedback/lib/feedback-sort.ts", code)).toEqual([]);
  });

  it.each([
    ["string[] in any order", "export function pick(value: undefined | string[] | string): string {\n  if (value === undefined) throw new Error('x');\n  return 'a';\n}\n"],
    ["Array<string>", "export const pick = (value: string | Array<string> | undefined): string => {\n  throw new Error(String(value));\n};\n"],
    ["ReadonlyArray<string>", "export function pick(value: string | ReadonlyArray<string> | undefined = undefined): string {\n  throw new Error(String(value));\n}\n"],
    [
      "a throw inside a callback",
      "export function pick(value: string | readonly string[] | undefined): string[] {\n  return [String(value)].map((item) => {\n    throw new Error(item);\n  });\n}\n",
    ],
  ])("fails on a search-param value parameter: %s", async (_name, code) => {
    expect(await ruleHits(libFile, code)).toHaveLength(1);
  });

  it("fails on a component that throws while reading its searchParams", async () => {
    const code =
      "type SearchParams = Promise<Record<string, string | string[] | undefined>>;\nexport async function Board({ searchParams }: { readonly searchParams: SearchParams }) {\n  const params = await searchParams;\n  if (params.category === 'x') throw new Error('unknown');\n  return <div />;\n}\n";
    expect(await ruleHits(componentFile, code)).toEqual([4]);
  });

  it("leaves other throws alone", async () => {
    const code =
      "export function read(value: string): string {\n  if (value === '') throw new Error('empty');\n  return value;\n}\nexport function both(value: string | undefined): string {\n  if (value === undefined) throw new Error('missing');\n  return value;\n}\n";
    expect(await ruleHits(libFile, code)).toEqual([]);
  });
});
