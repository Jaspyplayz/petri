import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { featureManifests } from "../src/features/registry";
import { featureMapFile, renderFeatureMap } from "./featuremap/render";

const root = join(import.meta.dirname, "..");

writeFileSync(join(root, featureMapFile), renderFeatureMap(featureManifests));
process.stdout.write(`featuremap: wrote ${featureMapFile} (${featureManifests.map((manifest) => manifest.id).join(", ")})\n`);
