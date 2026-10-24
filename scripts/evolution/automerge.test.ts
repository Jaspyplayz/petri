import { describe, expect, it } from "vitest";
import type { RiskLevel } from "../../src/shared/lib/feature-manifest";
import { decide, footprint, manifestRiskLevel, requiredLevel, type ChangedFile, type ManifestRisk } from "./automerge";

const existing = new Set(["blob", "feedback", "timeline"]);
const modified = (filename: string): ChangedFile => ({ filename, status: "modified" });
const added = (filename: string): ChangedFile => ({ filename, status: "added" });
const renamed = (from: string, to: string): ChangedFile => ({ filename: to, status: "renamed", previous_filename: from });

describe("footprint", () => {
  it("groups files by feature and lets FEATURE_MAP.md move with them", () => {
    expect(footprint([modified("src/features/blob/components/blob.tsx"), modified("FEATURE_MAP.md")], existing)).toEqual({
      features: ["blob"],
      newFeatures: [],
      server: [],
      shared: false,
      dependencies: false,
      migrations: false,
      wiring: [],
      other: [],
    });
  });

  it("counts a new feature's added page and the registry as generator wiring, and nothing else", () => {
    const fp = footprint([added("src/features/hats/index.ts"), added("src/app/hats/page.tsx"), modified("src/features/registry.ts")], existing);
    expect(fp.newFeatures).toEqual(["hats"]);
    expect(fp.wiring).toEqual(["src/app/hats/page.tsx", "src/features/registry.ts"]);
    expect(fp.other).toEqual([]);
    expect(footprint([modified("src/app/page.tsx"), added("src/features/hats/index.ts")], existing).other).toEqual(["src/app/page.tsx"]);
    expect(footprint([modified("src/features/registry.ts")], existing).other).toEqual(["src/features/registry.ts"]);
  });

  it("sees both sides of a rename", () => {
    const fp = footprint([{ filename: "src/features/blob/x.ts", status: "renamed", previous_filename: "src/shared/lib/x.ts" }], existing);
    expect(fp.shared).toBe(true);
    expect(fp.features).toEqual(["blob"]);
  });

  it("flags dependencies, migrations and other paths", () => {
    const fp = footprint([modified("package.json"), added("supabase/migrations/1_x.sql"), modified("docs/x.md")], existing);
    expect(fp.dependencies).toBe(true);
    expect(fp.migrations).toBe(true);
    expect(fp.other).toEqual(["docs/x.md"]);
  });
});

describe("requiredLevel", () => {
  const fp = (files: ChangedFile[]) => footprint(files, existing);
  const blob = modified("src/features/blob/lib/x.ts");

  it("follows the trust ladder", () => {
    expect(requiredLevel(fp([blob]), "low").level).toBe(1);
    expect(requiredLevel(fp([blob]), "medium").level).toBe(2);
    expect(requiredLevel(fp([added("src/features/hats/index.ts")]), "low").level).toBe(2);
    expect(requiredLevel(fp([blob, modified("src/features/feedback/x.ts")]), "low").level).toBe(3);
    expect(requiredLevel(fp([blob, modified("src/shared/lib/x.ts")]), "low").level).toBe(3);
    expect(requiredLevel(fp([added("supabase/migrations/1_x.sql")]), "low").level).toBe(4);
  });

  it.each([
    ["a medium-risk edit", "feedback", [modified("src/features/feedback/server/handlers.ts")], "medium"],
    ["a rename into server/", "feedback", [renamed("src/features/feedback/lib/x.ts", "src/features/feedback/server/x.ts")], "low"],
    ["a rename out of server/", "feedback", [renamed("src/features/feedback/server/x.ts", "src/features/feedback/lib/x.ts")], "low"],
    ["a new feature with a server/ file", "hats", [added("src/features/hats/index.ts"), added("src/features/hats/server/x.ts")], "low"],
  ] as const)("needs level 3 for a feature's server code: %s", (_, feature, files, risk) => {
    expect(requiredLevel(fp([...files]), risk)).toEqual({ level: 3, why: `it changes src/features/${feature}/server/` });
  });

  it("keeps today's level for a feature's components", () => {
    const component = modified("src/features/feedback/components/feedback-form.tsx");
    expect(requiredLevel(fp([component]), "low").level).toBe(1);
    expect(requiredLevel(fp([component]), "medium").level).toBe(2);
  });

  it("leaves high risk, dependencies, other paths and empty changes to a human", () => {
    expect(requiredLevel(fp([blob]), "high").level).toBeUndefined();
    expect(requiredLevel(fp([blob, modified("pnpm-lock.yaml")]), "low").level).toBeUndefined();
    expect(requiredLevel(fp([blob, modified("README.md")]), "low").level).toBeUndefined();
    expect(requiredLevel(fp([modified("FEATURE_MAP.md")]), "low").level).toBeUndefined();
  });
});

describe("manifestRiskLevel", () => {
  it("reads one plain literal and nothing cleverer", () => {
    expect(manifestRiskLevel('export const m = {\n  id: "blob",\n  riskLevel: "medium",\n};')).toBe("medium");
    expect(manifestRiskLevel("riskLevel: 'low',")).toBe("low");
    expect(manifestRiskLevel("riskLevel: LEVEL,")).toBeUndefined();
    expect(manifestRiskLevel('riskLevel: x ? "low" : "high",')).toBeUndefined();
    expect(manifestRiskLevel('// riskLevel: "high"\nriskLevel: "low",')).toBeUndefined();
    expect(manifestRiskLevel("id: \"blob\"")).toBeUndefined();
  });
});

describe("decide", () => {
  const blobOnly = footprint([modified("src/features/blob/lib/x.ts")], existing);
  const blob = (before: RiskLevel | undefined, after: RiskLevel | undefined): ManifestRisk[] => [{ feature: "blob", before, after }];

  it("merges only when the trust level reaches what the footprint needs", () => {
    expect(decide({ trustLevel: 1, issueRisk: "low", prRisks: ["low"], manifests: blob("low", "low"), footprint: blobOnly }).merge).toBe(true);
    expect(decide({ trustLevel: 0, issueRisk: "low", prRisks: ["low"], manifests: blob("low", "low"), footprint: blobOnly })).toEqual({
      merge: false,
      reason: "trust level 0 is below 1, which it needs because it's a low-risk change inside the feature blob",
    });
  });

  it("uses the highest risk anyone states, and refuses a PR that lowers the issue's risk", () => {
    expect(decide({ trustLevel: 1, issueRisk: "low", prRisks: ["medium"], manifests: [], footprint: blobOnly }).merge).toBe(false);
    expect(decide({ trustLevel: 4, issueRisk: "medium", prRisks: ["low"], manifests: [], footprint: blobOnly })).toEqual({
      merge: false,
      reason: "the PR says its riskLevel is low, lower than the issue's medium",
    });
  });

  it("counts the manifest's riskLevel on main even when the issue says low", () => {
    expect(decide({ trustLevel: 1, issueRisk: "low", prRisks: ["low"], manifests: blob("medium", "medium"), footprint: blobOnly })).toEqual({
      merge: false,
      reason: "trust level 1 is below 2, which it needs because its riskLevel is medium (feature blob)",
    });
    expect(decide({ trustLevel: 1, issueRisk: "low", prRisks: [], manifests: blob("low", "high"), footprint: blobOnly }).merge).toBe(false);
  });

  it("never merges a PR that lowers a manifest's riskLevel or hides it", () => {
    expect(decide({ trustLevel: 4, issueRisk: "low", prRisks: [], manifests: blob("medium", "low"), footprint: blobOnly })).toEqual({
      merge: false,
      reason: "it lowers the riskLevel of the feature blob from medium to low",
    });
    expect(decide({ trustLevel: 4, issueRisk: "low", prRisks: [], manifests: blob("low", undefined), footprint: blobOnly })).toEqual({
      merge: false,
      reason: "the riskLevel in src/features/blob/feature.manifest.ts can't be read at the PR's head",
    });
  });
});
