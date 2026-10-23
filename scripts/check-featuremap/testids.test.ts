import { describe, expect, it } from "vitest";
import { isRenderedSource, testIdsInSource } from "./testids";

describe("testIdsInSource", () => {
  it("reads literal, template, conditional and object-property testids with their lines", () => {
    const source = [
      "export function Card({ open, sort }: { open: boolean; sort: string }) {",
      "  const props = { \"data-testid\": \"card-extra\" };",
      "  return (",
      "    <div data-testid=\"card\">",
      "      <span data-testid={'card-title'} />",
      "      <a data-testid={`card-sort-${sort}`} />",
      "      <b data-testid={open ? \"card-open\" : `card-closed`} />",
      "      <i {...props} data-testid={(\"card-icon\" as const)} />",
      "    </div>",
      "  );",
      "}",
    ].join("\n");
    const uses = testIdsInSource("src/features/card/components/card.tsx", source);
    expect(uses.map((use) => (use.kind === "exact" ? [use.line, use.value] : [use.line, use.kind, use.text]))).toEqual([
      [2, "card-extra"],
      [4, "card"],
      [5, "card-title"],
      [6, "pattern", "`card-sort-${sort}`"],
      [7, "card-open"],
      [7, "card-closed"],
      [8, "card-icon"],
    ]);
  });

  it("turns a template into a pattern that matches only its fixed parts", () => {
    const [use] = testIdsInSource("a.tsx", "const x = <a data-testid={`card-${kind}-x.y`} />;");
    expect(use?.kind).toBe("pattern");
    const pattern = use?.kind === "pattern" ? use.pattern : /$^/;
    expect(["card-top-x.y", "card-a-b-x.y"].map((id) => pattern.test(id))).toEqual([true, true]);
    expect(["card--x.y", "card-top-xzy", "other-card-top-x.y", "card-top-x.y-z"].map((id) => pattern.test(id))).toEqual([false, false, false, false]);
  });

  it("marks a testid it can't read as computed", () => {
    const uses = testIdsInSource("a.tsx", "const a = <><a data-testid={link.testId} /><b data-testid /><c data-testid={} /></>;");
    expect(uses.map((use) => [use.kind, use.kind === "exact" ? use.value : use.text])).toEqual([
      ["computed", "link.testId"],
      ["computed", "data-testid"],
      ["computed", "data-testid={}"],
    ]);
  });

  it("ignores other attributes and plain strings that only look like testids", () => {
    expect(testIdsInSource("a.tsx", 'const a = <a data-test="x" id="card" title="data-testid" />; const s = "data-testid";')).toEqual([]);
  });
});

describe("isRenderedSource", () => {
  it.each([
    ["components/card.tsx", true],
    ["lib/ids.ts", true],
    ["components/card.test.tsx", false],
    ["lib/ids.test.ts", false],
    ["tests/card.e2e.ts", false],
    ["tests/helpers.ts", false],
    ["README.md", false],
  ])("%s → %s", (path, rendered) => {
    expect(isRenderedSource(path)).toBe(rendered);
  });
});
