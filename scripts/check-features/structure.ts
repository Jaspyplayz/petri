import { validateFeatureId } from "../new-feature/templates";

export type FeatureFile = {
  readonly path: string;
  readonly content: string;
};

export type FeatureFolder = {
  readonly name: string;
  readonly files: readonly FeatureFile[];
  readonly manifestIds: readonly string[];
};

export type FeaturesListing = {
  readonly folders: readonly FeatureFolder[];
  readonly strayFiles: readonly string[];
  readonly registryIds: readonly string[];
};

const REQUIRED_FILES = ["feature.manifest.ts", "index.ts", "README.md"] as const;
const UNIT_TEST = /^tests\/.+\.test\.ts$/;
const E2E_TEST = /^tests\/.+\.e2e\.ts$/;
const DECLARES_A_TEST = /\b(?:test|it)(?:\.each\([^)]*\))?\s*\(/;

function folderProblems(folder: FeatureFolder): string[] {
  const where = `src/features/${folder.name}`;
  const problems: string[] = [];
  const idError = validateFeatureId(folder.name);
  if (idError) problems.push(`${where}: ${idError}`);

  const byPath = new Map(folder.files.map((file) => [file.path, file]));
  for (const required of REQUIRED_FILES) {
    const file = byPath.get(required);
    if (!file) problems.push(`${where}: missing ${required}`);
    else if (file.content.trim() === "") problems.push(`${where}: ${required} is empty`);
  }

  const unitTests = folder.files.filter((file) => UNIT_TEST.test(file.path) && DECLARES_A_TEST.test(file.content));
  const e2eTests = folder.files.filter((file) => E2E_TEST.test(file.path) && DECLARES_A_TEST.test(file.content));
  if (unitTests.length === 0) problems.push(`${where}: needs at least one unit test in tests/*.test.ts`);
  if (e2eTests.length === 0) problems.push(`${where}: needs at least one e2e test in tests/*.e2e.ts`);

  if (byPath.has("feature.manifest.ts")) {
    if (folder.manifestIds.length !== 1) {
      problems.push(
        `${where}/feature.manifest.ts: must export exactly one manifest (found ${String(folder.manifestIds.length)})`,
      );
    } else if (folder.manifestIds[0] !== folder.name) {
      problems.push(
        `${where}/feature.manifest.ts: manifest id "${folder.manifestIds[0] ?? ""}" must match the folder name "${folder.name}"`,
      );
    }
  }
  return problems;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

export function checkFeatures(listing: FeaturesListing): string[] {
  const problems = listing.folders.flatMap(folderProblems);

  for (const stray of listing.strayFiles) {
    problems.push(`src/features/${stray}: only feature folders and registry.ts belong in src/features/`);
  }

  const manifestIds = listing.folders.flatMap((folder) => folder.manifestIds);
  for (const id of duplicates(manifestIds)) problems.push(`manifest id "${id}" is used by more than one feature`);

  const folderNames = new Set(listing.folders.map((folder) => folder.name));
  const registered = new Set(listing.registryIds);
  for (const id of duplicates(listing.registryIds)) problems.push(`src/features/registry.ts lists "${id}" twice`);
  for (const name of [...folderNames].sort()) {
    if (!registered.has(name)) {
      problems.push(`src/features/registry.ts is missing "${name}" (run pnpm new:feature --registry-only)`);
    }
  }
  for (const id of [...registered].sort()) {
    if (!folderNames.has(id)) problems.push(`src/features/registry.ts lists "${id}" but src/features/${id}/ does not exist`);
  }
  return problems;
}

export function manifestIdsOf(moduleExports: Readonly<Record<string, unknown>>): string[] {
  return Object.values(moduleExports).flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const id: unknown = Reflect.get(value, "id");
    const looksLikeManifest = "flows" in value && "selectors" in value && "riskLevel" in value;
    return looksLikeManifest && typeof id === "string" ? [id] : [];
  });
}
