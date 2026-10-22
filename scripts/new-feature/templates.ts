export const FEATURE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESERVED_IDS = new Set(["registry", "shared", "app", "api"]);

export type FeatureOptions = {
  readonly id: string;
  readonly route: string;
};

export type GeneratedFile = {
  readonly path: string;
  readonly content: string;
};

export function validateFeatureId(id: string): string | null {
  if (!FEATURE_ID_PATTERN.test(id) || id.length > 30) {
    return `Feature id "${id}" must be kebab-case (a-z, 0-9, single dashes), start with a letter, max 30 chars.`;
  }
  if (RESERVED_IDS.has(id)) {
    return `Feature id "${id}" is reserved.`;
  }
  return null;
}

export function validateRoute(route: string): string | null {
  if (!/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(route)) {
    return `Route "${route}" must look like "/" or "/some-path".`;
  }
  return null;
}

export function pascalCase(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function camelCase(id: string): string {
  const pascal = pascalCase(id);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function titleCase(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function featureFiles({ id, route }: FeatureOptions): GeneratedFile[] {
  const pascal = pascalCase(id);
  const camel = camelCase(id);
  const title = titleCase(id);
  const dir = `src/features/${id}`;

  return [
    {
      path: `${dir}/feature.manifest.ts`,
      content: `import { defineFeature } from "@/shared/lib/feature-manifest";

export const ${camel}Manifest = defineFeature({
  id: "${id}",
  title: "${title}",
  summary: "One sentence on what ${title} does for visitors.",
  routes: ["${route}"],
  uiLocation: "Describe where ${title} appears on screen in plain English.",
  howToReach: ["Open ${route}"],
  keyboardShortcuts: [],
  selectors: {
    panel: "${id}-panel",
    heading: "${id}-heading",
  },
  flows: {
    smoke: {
      description: "${title} renders its panel.",
      steps: [
        { action: "goto", path: "${route}" },
        { action: "expectVisible", target: "panel" },
        { action: "screenshot", name: "${id}-panel" },
      ],
    },
  },
  dataTables: [],
  owners: "agents",
  riskLevel: "low",
});
`,
    },
    {
      path: `${dir}/index.ts`,
      content: `export { ${camel}Manifest } from "./feature.manifest";
export { ${pascal}Panel } from "./components/${id}-panel";
`,
    },
    {
      path: `${dir}/components/${id}-panel.tsx`,
      content: `import { formatHeading } from "../lib/format-heading";

export function ${pascal}Panel() {
  return (
    <section data-testid="${id}-panel" aria-labelledby="${id}-heading" className="space-y-2">
      <h2 id="${id}-heading" data-testid="${id}-heading" className="text-xl font-semibold">
        {formatHeading("${title}")}
      </h2>
    </section>
  );
}
`,
    },
    {
      path: `${dir}/lib/format-heading.ts`,
      content: `export function formatHeading(raw: string): string {
  return raw.trim().replace(/\\s+/g, " ");
}
`,
    },
    {
      path: `${dir}/tests/format-heading.test.ts`,
      content: `import { describe, expect, it } from "vitest";
import { formatHeading } from "../lib/format-heading";

describe("formatHeading", () => {
  it("trims and collapses whitespace", () => {
    expect(formatHeading("  ${title}   panel ")).toBe("${title} panel");
  });
});
`,
    },
    {
      path: `${dir}/tests/${id}.e2e.ts`,
      content: `import { expect, test } from "@/shared/testing/e2e-fixture";

test("${id}: panel renders", async ({ page }) => {
  await page.goto("${route}");
  await expect(page.getByTestId("${id}-panel")).toBeVisible();
  await expect(page.getByTestId("${id}-heading")).toHaveText("${title}");
});
`,
    },
    {
      path: `${dir}/README.md`,
      content: `# ${title}

Feature id: \`${id}\` · Route: \`${route}\`

## What it does

Describe the user-facing behaviour in a few sentences.

## Invariants

- List the rules that must stay true (limits, privacy, data ownership).

## Structure

- \`feature.manifest.ts\`: id, routes, selectors and verification flows (source of FEATURE_MAP.md)
- \`index.ts\`: the only public entry point; \`src/app\` imports from here
- \`components/\`: UI, \`server/\`: server-only code (\`import "server-only"\`), \`lib/\`: pure logic
- \`tests/\`: \`*.test.ts\` (Vitest) and \`*.e2e.ts\` (Playwright)
`,
    },
  ];
}

export function routePageFile({ id, route }: FeatureOptions): GeneratedFile {
  const pascal = pascalCase(id);
  const pagePath = route === "/" ? "src/app/page.tsx" : `src/app${route}/page.tsx`;
  return {
    path: pagePath,
    content: `import { ${pascal}Panel } from "@/features/${id}";

export default function ${pascal}Page() {
  return <${pascal}Panel />;
}
`,
  };
}

export function registryFile(featureIds: readonly string[]): GeneratedFile {
  const sorted = [...featureIds].sort();
  const imports = sorted
    .map((id) => `import { ${camelCase(id)}Manifest } from "./${id}/feature.manifest";`)
    .join("\n");
  const entries = sorted.map((id) => `  ${camelCase(id)}Manifest,`).join("\n");
  return {
    path: "src/features/registry.ts",
    content: `${imports}${imports ? "\n" : ""}import type { FeatureManifest } from "@/shared/lib/feature-manifest";

export const featureManifests: readonly FeatureManifest[] = [
${entries}${entries ? "\n" : ""}];
`,
  };
}
