import type { RiskLevel } from "../../src/shared/lib/feature-manifest";
import { RISK_ORDER } from "./triage-output";

// One file of a PR, as GitHub's "list pull request files" API returns it.
export type ChangedFile = { readonly filename: string; readonly status: string; readonly previous_filename?: string | undefined };

export type Footprint = {
  readonly features: readonly string[];
  readonly newFeatures: readonly string[];
  readonly shared: boolean;
  readonly dependencies: boolean;
  readonly migrations: boolean;
  // Files the generator adds next to a new feature: its page and the registry.
  readonly wiring: readonly string[];
  readonly other: readonly string[];
};

const FEATURE = /^src\/features\/([a-z][a-z0-9-]*)\//;
const NEW_PAGE = /^src\/app\/(?:[a-z0-9-]+\/)+page\.tsx$/;
const DEPENDENCY_FILES = new Set(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]);
// Regenerated from the manifests and checked in CI (featuremap:check), so it moves with any feature change.
const GENERATED = new Set(["FEATURE_MAP.md"]);

// What a PR touches. A rename counts as both its old and new path, so a file can't be moved out of a protected place
// unnoticed. existingFeatures are the feature folders on main.
export function footprint(files: readonly ChangedFile[], existingFeatures: ReadonlySet<string>): Footprint {
  const features = new Set<string>();
  const wiring: string[] = [];
  const other: string[] = [];
  let shared = false;
  let dependencies = false;
  let migrations = false;
  const pending: { path: string; added: boolean }[] = [];
  for (const file of files) {
    const paths = [file.filename, ...(file.previous_filename === undefined ? [] : [file.previous_filename])];
    for (const path of paths) {
      const feature = FEATURE.exec(path)?.[1];
      if (feature !== undefined) features.add(feature);
      else if (path.startsWith("src/shared/")) shared = true;
      else if (DEPENDENCY_FILES.has(path)) dependencies = true;
      else if (path.startsWith("supabase/migrations/")) migrations = true;
      else if (!GENERATED.has(path)) pending.push({ path, added: file.status === "added" && path === file.filename });
    }
  }
  const newFeatures = [...features].filter((id) => !existingFeatures.has(id)).sort();
  for (const { path, added } of pending) {
    // The generator adds a page for a new feature and rewrites the registry. Anything else outside a feature folder,
    // including a change to an existing page, is for a human.
    const isWiring = newFeatures.length > 0 && ((added && NEW_PAGE.test(path)) || path === "src/features/registry.ts");
    (isWiring ? wiring : other).push(path);
  }
  return { features: [...features].sort(), newFeatures, shared, dependencies, migrations, wiring, other: [...new Set(other)].sort() };
}

export type Requirement = { readonly level: number; readonly why: string } | { readonly level: undefined; readonly why: string };

// The lowest trust level that may auto-merge this footprint (the ladder in CLAUDE.md). undefined: only a human.
export function requiredLevel(fp: Footprint, risk: RiskLevel): Requirement {
  if (fp.other.length > 0) return { level: undefined, why: `it changes files outside the feature folders: ${fp.other.slice(0, 5).join(", ")}` };
  if (fp.dependencies) return { level: undefined, why: "it changes dependencies, and there's no allow-list yet" };
  if (risk === "high") return { level: undefined, why: "its riskLevel is high" };
  if (fp.features.length === 0 && !fp.shared && !fp.migrations) return { level: undefined, why: "it changes no feature" };
  if (fp.migrations) return { level: 4, why: "it adds a Supabase migration" };
  if (fp.shared) return { level: 3, why: "it changes src/shared/" };
  if (fp.features.length > 1) return { level: 3, why: `it changes ${String(fp.features.length)} features (${fp.features.join(", ")})` };
  if (fp.newFeatures.length > 0) return { level: 2, why: `it adds the feature ${fp.newFeatures.join(", ")}` };
  if (risk === "medium") return { level: 2, why: `its riskLevel is medium (feature ${fp.features.join(", ")})` };
  return { level: 1, why: `it's a low-risk change inside the feature ${fp.features.join(", ")}` };
}

export type MergeDecision = { readonly merge: true; readonly reason: string } | { readonly merge: false; readonly reason: string };

export function decide(input: {
  readonly trustLevel: number;
  readonly issueRisk: RiskLevel;
  // What the PR claims: its data comment and its risk:<level> labels.
  readonly prRisks: readonly RiskLevel[];
  readonly footprint: Footprint;
}): MergeDecision {
  const rank = (risk: RiskLevel): number => RISK_ORDER.indexOf(risk);
  const lower = input.prRisks.filter((risk) => rank(risk) < rank(input.issueRisk));
  if (lower.length > 0) {
    return { merge: false, reason: `the PR says its riskLevel is ${lower.join(", ")}, lower than the issue's ${input.issueRisk}` };
  }
  const risk = [input.issueRisk, ...input.prRisks].reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const required = requiredLevel(input.footprint, risk);
  if (required.level === undefined) return { merge: false, reason: `a human merges this one: ${required.why}` };
  if (input.trustLevel < required.level) {
    return { merge: false, reason: `trust level ${String(input.trustLevel)} is below ${String(required.level)}, which it needs because ${required.why}` };
  }
  return { merge: true, reason: `trust level ${String(input.trustLevel)} allows it: ${required.why}` };
}
