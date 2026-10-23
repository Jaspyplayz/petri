import type { TestIdUse } from "./testids";

export type FeatureTestIds = {
  readonly id: string;
  readonly selectors: Readonly<Record<string, string>>;
  readonly uses: readonly TestIdUse[];
};

function where(use: TestIdUse): string {
  return `${use.file}:${String(use.line)}`;
}

export function selectorProblems(feature: FeatureTestIds): string[] {
  const testIds = Object.values(feature.selectors);
  const known = new Set(testIds);
  const problems: string[] = [];
  for (const use of feature.uses) {
    if (use.kind === "computed") {
      problems.push(
        `${where(use)}: ${use.text} can't be checked against the manifest; use a string literal, or a template that starts with a fixed prefix`,
      );
    } else if (use.kind === "exact" && !known.has(use.value)) {
      problems.push(`${where(use)}: data-testid "${use.value}" isn't in the ${feature.id} manifest's selectors`);
    } else if (use.kind === "pattern" && !testIds.some((testId) => use.pattern.test(testId))) {
      problems.push(`${where(use)}: data-testid ${use.text} matches none of the ${feature.id} manifest's selectors`);
    }
  }
  for (const [name, testId] of Object.entries(feature.selectors)) {
    const rendered = feature.uses.some((use) => (use.kind === "exact" ? use.value === testId : use.kind === "pattern" && use.pattern.test(testId)));
    if (!rendered) {
      problems.push(`${feature.id} manifest: selector ${name} ("${testId}") isn't a data-testid anywhere in src/features/${feature.id}/`);
    }
  }
  return problems;
}

export function freshnessProblem(file: string, expected: string, actual: string | undefined): string | undefined {
  if (actual === undefined) return `${file} is missing; run pnpm featuremap and commit it`;
  const actualLines = actual.replace(/\r\n/g, "\n").split("\n");
  const expectedLines = expected.split("\n");
  const firstDifference = expectedLines.findIndex((line, index) => line !== actualLines[index]);
  if (firstDifference === -1 && actualLines.length === expectedLines.length) return undefined;
  const line = firstDifference === -1 ? expectedLines.length + 1 : firstDifference + 1;
  return `${file} is out of date (first difference at line ${String(line)}); run pnpm featuremap and commit it instead of editing it by hand`;
}
