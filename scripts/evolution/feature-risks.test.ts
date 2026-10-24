import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { featureManifests } from "../../src/features/registry";
import { featureRisks } from "./feature-risks";

const root = join(import.meta.dirname, "..", "..");
const scratch: string[] = [];

function repoWith(manifests: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "feature-risks-"));
  scratch.push(dir);
  mkdirSync(join(dir, "src", "features"), { recursive: true });
  for (const [feature, source] of Object.entries(manifests)) {
    mkdirSync(join(dir, "src", "features", feature), { recursive: true });
    writeFileSync(join(dir, "src", "features", feature, "feature.manifest.ts"), source);
  }
  writeFileSync(join(dir, "src", "features", "registry.ts"), "");
  return dir;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("featureRisks", () => {
  it("reads the same id and riskLevel as the registry for every feature on this checkout", () => {
    expect(featureRisks(root)).toEqual(new Map(featureManifests.map((manifest) => [manifest.id, manifest.riskLevel])));
  });

  it("reads a manifest without running it", () => {
    const dir = repoWith({ blob: 'throw new Error("ran");\nexport const m = defineFeature({ id: "blob", riskLevel: "low" });' });
    expect(featureRisks(dir)).toEqual(new Map([["blob", "low"]]));
  });

  it.each([
    ["a riskLevel that isn't a plain literal", 'defineFeature({ id: "blob", riskLevel: level });'],
    ["two riskLevel mentions", 'defineFeature({ id: "blob", riskLevel: "high" }); // riskLevel: "low"'],
    ["an id that isn't the folder's", 'defineFeature({ id: "other", riskLevel: "low" });'],
    ["no defineFeature", 'export const m = { id: "blob", riskLevel: "low" };'],
  ])("throws on %s", (_, source) => {
    expect(() => featureRisks(repoWith({ blob: source }))).toThrow("src/features/blob/feature.manifest.ts can't be read as text");
  });

  it("throws on a feature folder without a manifest", () => {
    const dir = repoWith({});
    mkdirSync(join(dir, "src", "features", "blob"));
    expect(() => featureRisks(dir)).toThrow("feature.manifest.ts");
  });
});
