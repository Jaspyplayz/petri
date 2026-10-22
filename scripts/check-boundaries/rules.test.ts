import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseCruiseResult } from "./graph";

const root = join(import.meta.dirname, "../..");
const scratch = mkdtempSync(join(tmpdir(), "petri-boundaries-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const tree: Readonly<Record<string, string>> = {
  "tsconfig.json": '{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler" } }\n',
  "src/shared/lib/util.ts": "export const util = 1;\n",
  "src/shared/lib/up.ts": 'import { a } from "../../features/a";\nexport const up = a;\n',
  "src/features/registry.ts": 'import { manifest } from "./a/feature.manifest";\nexport const manifests = [manifest];\n',
  "src/features/a/feature.manifest.ts": 'import { util } from "../../shared/lib/util";\nexport const manifest = util;\n',
  "src/features/a/index.ts": 'export { a } from "./lib/a";\n',
  "src/features/a/lib/a.ts":
    'import { randomUUID } from "node:crypto";\nimport { util } from "../../../shared/lib/util";\nexport const a = util + randomUUID().length;\n',
  "src/features/a/lib/direct.ts": 'import { b } from "../../b/lib/b";\nexport const direct = b;\n',
  "src/features/a/lib/via-bridge.ts": 'import { b } from "../../../bridge/re-export";\nexport const viaBridge = b;\n',
  "src/features/a/lib/route.ts": 'import { page } from "../../../app/page";\nexport const route = page;\n',
  "src/features/b/index.ts": 'export { b } from "./lib/b";\n',
  "src/features/b/lib/b.ts": "export const b = 2;\n",
  "src/bridge/re-export.ts": 'export { b } from "../features/b/lib/b";\n',
  "src/app/page.tsx": 'import { a } from "../features/a";\nimport { util } from "../shared/lib/util";\nimport { layout } from "./layout";\nexport const page = a + util + layout;\n',
  "src/app/layout.tsx": "export const layout = 3;\n",
  "src/app/internals.ts": 'import { a } from "../features/a/lib/a";\nexport const internals = a;\n',
  "src/instrumentation.ts": 'import { b } from "./features/b";\nimport { util } from "./shared/lib/util";\nexport const register = b + util;\n',
};

function cruise(): string[] {
  for (const [path, content] of Object.entries(tree)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), content);
  }
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"),
      "src",
      "--config",
      join(root, ".dependency-cruiser.cjs"),
      "--output-type",
      "json",
    ],
    { cwd: scratch, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return parseCruiseResult(result.stdout)
    .summary.violations.map((violation) => `${violation.rule.name}: ${violation.from} → ${violation.to}`)
    .sort();
}

describe("import boundaries", () => {
  it("allow only the listed directions and reject neutral folders", { timeout: 60_000 }, () => {
    expect(cruise()).toEqual([
      "app-imports-feature-internals: src/app/internals.ts → src/features/a/lib/a.ts",
      "feature-imports-another-feature: src/features/a/lib/direct.ts → src/features/b/lib/b.ts",
      "feature-imports-app: src/features/a/lib/route.ts → src/app/page.tsx",
      "import-into-src-top-level-folder: src/features/a/lib/via-bridge.ts → src/bridge/re-export.ts",
      "not-in-allowed: src/app/internals.ts → src/features/a/lib/a.ts",
      "not-in-allowed: src/bridge/re-export.ts → src/features/b/lib/b.ts",
      "not-in-allowed: src/features/a/lib/direct.ts → src/features/b/lib/b.ts",
      "not-in-allowed: src/features/a/lib/route.ts → src/app/page.tsx",
      "not-in-allowed: src/features/a/lib/via-bridge.ts → src/bridge/re-export.ts",
      "not-in-allowed: src/shared/lib/up.ts → src/features/a/index.ts",
      "shared-imports-feature-or-app: src/shared/lib/up.ts → src/features/a/index.ts",
      "src-top-level-folder: src/bridge/re-export.ts → src/features/b/lib/b.ts",
    ]);
  });
});
