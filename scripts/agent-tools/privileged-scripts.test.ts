import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { privilegedScriptProblems, repoAt, type Repo } from "./privileged-scripts";

const root = join(import.meta.dirname, "..", "..");

const files: Record<string, string> = {
  "scripts/job.ts": [
    'import { readFileSync } from "node:fs";',
    'import { z } from "zod";',
    'import { helper } from "./lib/helper";',
    'import type { Shape } from "../src/shape";',
    'export type { Other } from "../src/other";',
    'import { type Risk } from "@/risk";',
  ].join("\n"),
  "scripts/lib/helper.ts": 'export { blobManifest } from "../../src/features/blob/feature.manifest.ts";',
  "scripts/lazy.ts": 'const name = "./job";\nawait import(name);',
  "scripts/broken.ts": 'import "./missing";',
  "src/shape.ts": "",
  "src/other.ts": "",
  "src/risk.ts": "",
  "src/features/blob/feature.manifest.ts": 'import { defineFeature } from "@/shared/lib/feature-manifest";',
  "src/shared/lib/feature-manifest.ts": "",
};

const repo: Repo = {
  read: (path) => files[path],
  scripts: {
    job: "tsx --env-file-if-exists=.env.local scripts/job.ts",
    lazy: "tsx scripts/lazy.ts",
    broken: "node scripts/broken.ts",
    build: "next build",
  },
  paths: { "@/*": ["./src/*"] },
  isProtected: (path) => path.startsWith("scripts/"),
};

function workflow(permissions: string, steps: string): string {
  return `on: workflow_dispatch
permissions:
  contents: read
jobs:
  j:
    runs-on: ubuntu-latest
    permissions:
      ${permissions}
    steps:
${steps}`;
}

const secretStep = `      - name: Job
        env:
          KEY: \${{ secrets.KEY }}
        run: pnpm -s job --flag`;

describe("privilegedScriptProblems", () => {
  it("reports every file outside the protected paths that a privileged step's script loads at runtime", () => {
    expect(privilegedScriptProblems("w.yml", workflow("contents: read", secretStep), repo)).toEqual([
      'w.yml: job j (holds KEY), "Job" runs scripts/job.ts, which loads src/risk.ts (imported by scripts/job.ts), outside the protected paths',
      'w.yml: job j (holds KEY), "Job" runs scripts/job.ts, which loads src/features/blob/feature.manifest.ts (imported by scripts/lib/helper.ts), outside the protected paths',
      'w.yml: job j (holds KEY), "Job" runs scripts/job.ts, which loads src/shared/lib/feature-manifest.ts (imported by src/features/blob/feature.manifest.ts), outside the protected paths',
    ]);
  });

  it("counts a token in a job that can write, and not one in a read-only job", () => {
    const step = `      - env:
          GH_TOKEN: \${{ github.token }}
        run: tsx src/risk.ts`;
    expect(privilegedScriptProblems("w.yml", workflow("pull-requests: write", step), repo)).toEqual([
      'w.yml: job j (holds GH_TOKEN), "tsx src/risk.ts" runs src/risk.ts, which is outside the protected paths',
    ]);
    expect(privilegedScriptProblems("w.yml", workflow("pull-requests: read", step), repo)).toEqual([]);
  });

  it("checks every run step in a job that holds a secret, since a step can change the ones after it", () => {
    const steps = `      - run: |
          echo "start"
          pnpm -s job
      - uses: some/action@v1
        with:
          token: \${{ secrets.BOT }}`;
    expect(privilegedScriptProblems("w.yml", workflow("contents: read", steps), repo)).toHaveLength(3);
  });

  it("fails closed on a command, script or import it can't follow", () => {
    const steps = `      - env:
          KEY: \${{ secrets.KEY }}
        run: |
          pnpm build
          pnpm -s nope
          npx some-tool
          pnpm -s lazy && pnpm -s broken
          node -e "1"`;
    expect(privilegedScriptProblems("w.yml", workflow("contents: read", steps), repo)).toEqual([
      'w.yml: job j (holds KEY), "pnpm build" runs pnpm build ("next build"), which this check can\'t follow',
      'w.yml: job j (holds KEY), "pnpm build" runs "pnpm -s nope", which isn\'t a package.json script',
      'w.yml: job j (holds KEY), "pnpm build" runs "npx some-tool", which this check can\'t follow',
      'w.yml: job j (holds KEY), "pnpm build" runs "node -e 1", which loads no file this check can follow',
      'w.yml: job j (holds KEY), "pnpm build" runs scripts/lazy.ts, which loads scripts/lazy.ts, which has an import() this check can\'t follow',
      'w.yml: job j (holds KEY), "pnpm build" runs scripts/broken.ts, which loads scripts/broken.ts, whose import "./missing" doesn\'t resolve to a file',
    ]);
  });

  it("follows pnpm exec and npx into node or tsx, and passes package commands that load no repo file", () => {
    const steps = `      - env:
          KEY: \${{ secrets.KEY }}
        run: |
          pnpm exec playwright install --only-shell chromium
          gh pr list
          pnpm exec tsx src/risk.ts`;
    expect(privilegedScriptProblems("w.yml", workflow("contents: read", steps), repo)).toEqual([
      'w.yml: job j (holds KEY), "pnpm exec playwright install --only-shell chromium" runs src/risk.ts, which is outside the protected paths',
    ]);
  });

  it("leaves a job with no secrets and a read-only token alone", () => {
    expect(privilegedScriptProblems("w.yml", workflow("contents: read", "      - run: pnpm -s job"), repo)).toEqual([]);
  });

  it("finds no privileged step in .github/workflows that loads a file an agent PR can change", () => {
    const real = repoAt(root);
    const dir = join(root, ".github", "workflows");
    const problems = readdirSync(dir).flatMap((file) => privilegedScriptProblems(file, readFileSync(join(dir, file), "utf8"), real));
    // Known, not fixed yet (docs/decisions.md P9): post-merge verifies production with the merged manifests' flows in
    // the job whose later steps get the service-role key. The second expect fails once the job is split, so this goes.
    const postMergeVerify = (problem: string): boolean =>
      problem.startsWith("evolution-post-merge.yml: job post-merge ") && problem.includes(`"Verify production (flows that don't write)" runs scripts/verify.ts, which loads src/`);
    expect(problems.filter((problem) => !postMergeVerify(problem))).toEqual([]);
    expect(problems.filter(postMergeVerify)).not.toEqual([]);
  });
});
