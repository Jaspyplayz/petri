import { describe, expect, it } from "vitest";
import {
  type CruisedModule,
  findServerLeaks,
  formatReport,
  isClientEntrySource,
  parseCruiseResult,
  SERVICE_ROLE_CLIENT,
  serverOnlyReason,
} from "./graph";

function moduleOf(source: string, imports: readonly string[] = [], typeOnly: readonly string[] = []): CruisedModule {
  return {
    source,
    dependencies: [
      ...imports.map((resolved) => ({
        module: resolved === "server-only" ? "server-only" : `./${resolved}`,
        resolved: resolved === "server-only" ? "node_modules/server-only/index.js" : resolved,
        dependencyTypes: ["local", "import"],
      })),
      ...typeOnly.map((resolved) => ({
        module: `./${resolved}`,
        resolved,
        dependencyTypes: ["local", "type-only", "import"],
      })),
    ],
  };
}

const clientEntries = new Set(["src/features/a/components/widget.tsx"]);
const isClient = (source: string) => clientEntries.has(source);

describe("isClientEntrySource", () => {
  it.each([
    ['"use client";\nimport x from "y";', true],
    ["'use client'\nexport const a = 1;", true],
    ['﻿"use client";', true],
    ['"use strict";\n"use client";', true],
    ['import "server-only";\n"use client";', false],
    ['"use server";\nexport async function act() {}', false],
    ["export const a = 1;", false],
  ])("%j → %s", (content, expected) => {
    expect(isClientEntrySource(content)).toBe(expected);
  });
});

describe("serverOnlyReason", () => {
  it("flags server/ folders, the service-role client and server-only importers", () => {
    expect(serverOnlyReason(moduleOf("src/features/a/server/load.ts"))).toBe("lives in a server/ folder");
    expect(serverOnlyReason(moduleOf(SERVICE_ROLE_CLIENT))).toBe("is the service-role Supabase client");
    expect(serverOnlyReason(moduleOf("src/shared/lib/x.ts", ["server-only"]))).toBe('imports "server-only"');
    expect(serverOnlyReason(moduleOf("src/shared/lib/serverless.ts"))).toBeUndefined();
  });
});

describe("findServerLeaks", () => {
  it("reports the chain from a client component to server-only code", () => {
    const modules = [
      moduleOf("src/features/a/components/widget.tsx", ["src/features/a/lib/helper.ts"]),
      moduleOf("src/features/a/lib/helper.ts", ["src/features/a/server/load.ts"]),
      moduleOf("src/features/a/server/load.ts", ["server-only"]),
    ];
    expect(findServerLeaks(modules, isClient)).toEqual([
      {
        clientEntry: "src/features/a/components/widget.tsx",
        chain: [
          "src/features/a/components/widget.tsx",
          "src/features/a/lib/helper.ts",
          "src/features/a/server/load.ts",
        ],
        reason: "lives in a server/ folder",
      },
    ]);
  });

  it("ignores type-only imports, which are erased before bundling", () => {
    const modules = [
      moduleOf("src/features/a/components/widget.tsx", [], [SERVICE_ROLE_CLIENT]),
      moduleOf(SERVICE_ROLE_CLIENT, ["server-only"]),
    ];
    expect(findServerLeaks(modules, isClient)).toEqual([]);
  });

  it("lets server components import server code", () => {
    const modules = [
      moduleOf("src/features/a/components/board.tsx", ["src/features/a/server/load.ts", "src/features/a/components/widget.tsx"]),
      moduleOf("src/features/a/server/load.ts", ["server-only"]),
      moduleOf("src/features/a/components/widget.tsx"),
    ];
    expect(findServerLeaks(modules, isClient)).toEqual([]);
  });

  it("flags a client entry that imports server-only itself and survives import cycles", () => {
    const modules = [
      moduleOf("src/features/a/components/widget.tsx", ["server-only", "src/features/a/lib/x.ts"]),
      moduleOf("src/features/a/lib/x.ts", ["src/features/a/components/widget.tsx"]),
    ];
    expect(findServerLeaks(modules, isClient)).toEqual([
      {
        clientEntry: "src/features/a/components/widget.tsx",
        chain: ["src/features/a/components/widget.tsx"],
        reason: 'imports "server-only"',
      },
    ]);
  });
});

describe("parseCruiseResult and formatReport", () => {
  it("parses dependency-cruiser JSON and formats violations and leaks", () => {
    const result = parseCruiseResult(
      JSON.stringify({
        modules: [moduleOf("src/app/page.tsx")],
        summary: {
          violations: [
            { rule: { name: "feature-imports-another-feature", severity: "error" }, from: "src/features/a/x.ts", to: "src/features/b/y.ts" },
          ],
          error: 1,
        },
      }),
    );
    const report = formatReport(result.summary.violations, [
      { clientEntry: "c.tsx", chain: ["c.tsx", "s/server/d.ts"], reason: "lives in a server/ folder" },
    ]);
    expect(report).toContain("✖ feature-imports-another-feature: src/features/a/x.ts → src/features/b/y.ts");
    expect(report).toContain("✖ client-reaches-server-only: c.tsx reaches s/server/d.ts, which lives in a server/ folder");
    expect(report).toContain("via c.tsx → s/server/d.ts");
  });

  it("rejects output that is not a dependency-cruiser result", () => {
    expect(() => parseCruiseResult('{"modules": "nope"}')).toThrow();
  });
});
