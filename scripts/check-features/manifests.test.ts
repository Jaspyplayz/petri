import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { featureFiles } from "../new-feature/templates";
import { manifestIdsInSource, registryIdsInSource } from "./manifests";

const featuresDir = join(import.meta.dirname, "..", "..", "src", "features");

describe("manifestIdsInSource", () => {
  it("reads the id of a generated manifest without running it", () => {
    const manifest = featureFiles({ id: "sparkles", route: "/sparkles" }).find((file) => file.path.endsWith("feature.manifest.ts"));
    expect(manifestIdsInSource(manifest?.content ?? "")).toEqual(["sparkles"]);
    expect(manifestIdsInSource(readFileSync(join(featuresDir, "blob", "feature.manifest.ts"), "utf8"))).toEqual(["blob"]);
  });

  it("counts every defineFeature call and flags ids that aren't string literals", () => {
    const source = [
      'export const a = defineFeature({ id: "a" as const, flows: {} });',
      "const name = 'b';",
      "export const b = defineFeature({ id: name });",
      "export const c = defineFeature(options);",
    ].join("\n");
    expect(manifestIdsInSource(source)).toEqual(["a", "<id is not a string literal>", "<id is not a string literal>"]);
  });

  it("never executes the file", () => {
    expect(manifestIdsInSource('process.exit(0);\nexport const m = defineFeature({ id: "blob" });')).toEqual(["blob"]);
  });

  it("finds no manifest in a file that only builds a look-alike object", () => {
    expect(manifestIdsInSource('export const m = { id: "blob", flows: {}, selectors: {}, riskLevel: "low" };')).toEqual([]);
  });
});

describe("registryIdsInSource", () => {
  it("reads the real registry", () => {
    expect(registryIdsInSource(readFileSync(join(featuresDir, "registry.ts"), "utf8"))).toEqual({
      ids: ["analytics", "blob", "feedback", "timeline"],
      problems: [],
    });
  });

  it("maps each entry to the folder its manifest is imported from", () => {
    const source = [
      'import { blobManifest } from "./blob/feature.manifest";',
      'import { otherManifest as renamed } from "./timeline/feature.manifest.ts";',
      "export const featureManifests = [blobManifest, renamed] as const;",
    ].join("\n");
    expect(registryIdsInSource(source)).toEqual({ ids: ["blob", "timeline"], problems: [] });
  });

  it("reports entries that aren't imported manifests", () => {
    const source = [
      'import { blobManifest } from "./blob/feature.manifest";',
      'import { helper } from "@/shared/lib/helper";',
      "export const featureManifests = [blobManifest, helper, ...more, { id: 'x' }];",
    ].join("\n");
    expect(registryIdsInSource(source)).toEqual({
      ids: ["blob"],
      problems: [1, 2, 3].map(
        (index) => `src/features/registry.ts: featureManifests[${String(index)}] must be a manifest imported from ./<id>/feature.manifest`,
      ),
    });
  });

  it("requires featureManifests to be an array literal", () => {
    expect(registryIdsInSource("export const featureManifests = build();").problems).toEqual([
      "src/features/registry.ts: must declare featureManifests as an array literal",
    ]);
  });
});
