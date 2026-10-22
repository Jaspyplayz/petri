import { describe, expect, it } from "vitest";
import { featureFiles } from "../new-feature/templates";
import { checkFeatures, type FeatureFolder, manifestIdsOf } from "./structure";

function generatedFolder(id: string): FeatureFolder {
  const prefix = `src/features/${id}/`;
  const files = featureFiles({ id, route: `/${id}` })
    .filter((file) => file.path.startsWith(prefix))
    .map((file) => ({ path: file.path.slice(prefix.length), content: file.content }));
  return { name: id, files, manifestIds: [id] };
}

function without(folder: FeatureFolder, predicate: (path: string) => boolean): FeatureFolder {
  return { ...folder, files: folder.files.filter((file) => !predicate(file.path)) };
}

describe("checkFeatures", () => {
  it("accepts a feature straight from the generator", () => {
    expect(checkFeatures({ folders: [generatedFolder("sparkles")], strayFiles: [], registryIds: ["sparkles"] })).toEqual(
      [],
    );
  });

  it.each([
    ["feature.manifest.ts", "src/features/sparkles: missing feature.manifest.ts"],
    ["index.ts", "src/features/sparkles: missing index.ts"],
    ["README.md", "src/features/sparkles: missing README.md"],
  ])("reports a missing %s", (file, problem) => {
    const folder = without(generatedFolder("sparkles"), (path) => path === file);
    expect(checkFeatures({ folders: [folder], strayFiles: [], registryIds: ["sparkles"] })).toContain(problem);
  });

  it("requires a unit test and an e2e test that declare tests", () => {
    const noUnit = without(generatedFolder("sparkles"), (path) => path.endsWith(".test.ts"));
    const emptyE2e: FeatureFolder = {
      ...generatedFolder("sparkles"),
      files: generatedFolder("sparkles").files.map((file) =>
        file.path.endsWith(".e2e.ts") ? { ...file, content: 'import "x";\n' } : file,
      ),
    };
    expect(checkFeatures({ folders: [noUnit], strayFiles: [], registryIds: ["sparkles"] })).toEqual([
      "src/features/sparkles: needs at least one unit test in tests/*.test.ts (a test() or it() imported from vitest)",
    ]);
    expect(checkFeatures({ folders: [emptyE2e], strayFiles: [], registryIds: ["sparkles"] })).toEqual([
      "src/features/sparkles: needs at least one e2e test in tests/*.e2e.ts (a test() imported from the e2e fixture)",
    ]);
  });

  it("accepts test.each style tests", () => {
    const folder: FeatureFolder = {
      ...generatedFolder("sparkles"),
      files: generatedFolder("sparkles").files.map((file) =>
        file.path.endsWith(".test.ts")
          ? { ...file, content: 'import { it } from "vitest";\nit.each([[1]])("x %s", () => {});\n' }
          : file,
      ),
    };
    expect(checkFeatures({ folders: [folder], strayFiles: [], registryIds: ["sparkles"] })).toEqual([]);
  });

  it("reports an empty README", () => {
    const folder: FeatureFolder = {
      ...generatedFolder("sparkles"),
      files: generatedFolder("sparkles").files.map((file) =>
        file.path === "README.md" ? { ...file, content: "  \n" } : file,
      ),
    };
    expect(checkFeatures({ folders: [folder], strayFiles: [], registryIds: ["sparkles"] })).toEqual([
      "src/features/sparkles: README.md is empty",
    ]);
  });

  it("requires exactly one manifest whose id matches the folder", () => {
    const wrongId = { ...generatedFolder("sparkles"), manifestIds: ["glitter"] };
    const twoManifests = { ...generatedFolder("sparkles"), manifestIds: ["sparkles", "sparkles"] };
    expect(checkFeatures({ folders: [wrongId], strayFiles: [], registryIds: ["sparkles"] })).toEqual([
      'src/features/sparkles/feature.manifest.ts: manifest id "glitter" must match the folder name "sparkles"',
    ]);
    expect(checkFeatures({ folders: [twoManifests], strayFiles: [], registryIds: ["sparkles"] })).toContain(
      "src/features/sparkles/feature.manifest.ts: must export exactly one manifest (found 2)",
    );
  });

  it("reports duplicate manifest ids across features", () => {
    const a = { ...generatedFolder("sparkles") };
    const b = { ...generatedFolder("glitter"), manifestIds: ["sparkles"] };
    expect(checkFeatures({ folders: [a, b], strayFiles: [], registryIds: ["sparkles", "glitter"] })).toContain(
      'manifest id "sparkles" is used by more than one feature',
    );
  });

  it("keeps the registry in sync with the folders", () => {
    expect(
      checkFeatures({ folders: [generatedFolder("sparkles")], strayFiles: [], registryIds: ["ghost", "ghost"] }),
    ).toEqual([
      'src/features/registry.ts lists "ghost" twice',
      'src/features/registry.ts is missing "sparkles" (run pnpm new:feature --registry-only)',
      'src/features/registry.ts lists "ghost" but src/features/ghost/ does not exist',
    ]);
  });

  it("rejects stray files and badly named folders", () => {
    const badName = { ...generatedFolder("sparkles"), name: "Sparkles", manifestIds: ["Sparkles"] };
    const problems = checkFeatures({ folders: [badName], strayFiles: ["helpers.ts"], registryIds: ["Sparkles"] });
    expect(problems).toContain("src/features/helpers.ts: only feature folders and registry.ts belong in src/features/");
    expect(problems.some((problem) => problem.startsWith("src/features/Sparkles: Feature id"))).toBe(true);
  });
});

describe("manifestIdsOf", () => {
  it("finds manifest-shaped exports only", () => {
    expect(
      manifestIdsOf({
        blobManifest: { id: "blob", flows: {}, selectors: {}, riskLevel: "low" },
        helper: () => 1,
        notAManifest: { id: "x" },
        nothing: null,
      }),
    ).toEqual(["blob"]);
  });
});
