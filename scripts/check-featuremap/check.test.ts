import { describe, expect, it } from "vitest";
import { freshnessProblem, selectorProblems } from "./check";
import { testIdsInSource } from "./testids";

const file = "src/features/card/components/card.tsx";

function feature(selectors: Record<string, string>, source: string) {
  return { id: "card", selectors, uses: testIdsInSource(file, source) };
}

describe("selectorProblems", () => {
  it("passes when every selector is rendered and every rendered testid is a selector", () => {
    const source = "const a = <div data-testid=\"card\"><a data-testid={`card-sort-${sort}`} /></div>;";
    expect(selectorProblems(feature({ root: "card", sortTop: "card-sort-top", sortNew: "card-sort-new" }, source))).toEqual([]);
  });

  it("reports a testid renamed in the code but not in the manifest, from both sides", () => {
    const source = 'const a = <div data-testid="card-box" />;';
    expect(selectorProblems(feature({ root: "card" }, source))).toEqual([
      `${file}:1: data-testid "card-box" isn't in the card manifest's selectors`,
      'card manifest: selector root ("card") isn\'t a data-testid anywhere in src/features/card/',
    ]);
  });

  it("reports a template that matches no selector, and a computed testid", () => {
    const source = ["const a = <a data-testid={`card-order-${sort}`} />;", "const b = <b data-testid={ids.title} />;"].join("\n");
    expect(selectorProblems(feature({ sortTop: "card-sort-top" }, source))).toEqual([
      `${file}:1: data-testid \`card-order-\${sort}\` matches none of the card manifest's selectors`,
      `${file}:2: ids.title can't be checked against the manifest; use a string literal, or a template that starts with a fixed prefix`,
      'card manifest: selector sortTop ("card-sort-top") isn\'t a data-testid anywhere in src/features/card/',
    ]);
  });

  it("has nothing to check for a feature without selectors or testids", () => {
    expect(selectorProblems(feature({}, "export const track = () => undefined;"))).toEqual([]);
  });
});

describe("freshnessProblem", () => {
  it("accepts the same text, including with Windows line endings", () => {
    expect(freshnessProblem("MAP.md", "a\nb\n", "a\nb\n")).toBeUndefined();
    expect(freshnessProblem("MAP.md", "a\nb\n", "a\r\nb\r\n")).toBeUndefined();
  });

  it("names the first line that differs", () => {
    expect(freshnessProblem("MAP.md", "a\nb\nc\n", "a\nB\nc\n")).toBe(
      "MAP.md is out of date (first difference at line 2); run pnpm featuremap and commit it instead of editing it by hand",
    );
    expect(freshnessProblem("MAP.md", "a\n", "a\nextra\n")).toMatch(/first difference at line 2\)/);
    expect(freshnessProblem("MAP.md", "a\nb\n", "a\n")).toMatch(/first difference at line 2\)/);
  });

  it("reports a missing file", () => {
    expect(freshnessProblem("MAP.md", "a\n", undefined)).toBe("MAP.md is missing; run pnpm featuremap and commit it");
  });
});
