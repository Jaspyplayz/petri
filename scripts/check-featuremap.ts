import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { featureManifests } from "../src/features/registry";
import { freshnessProblem, selectorProblems } from "./check-featuremap/check";
import { isRenderedSource, testIdsInSource } from "./check-featuremap/testids";
import { featureMapFile, renderFeatureMap } from "./featuremap/render";

const root = join(import.meta.dirname, "..");

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function featureSources(id: string): { file: string; text: string }[] {
  const dir = join(root, "src", "features", id);
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => toPosix(relative(root, join(entry.parentPath, entry.name))))
    .filter((file) => isRenderedSource(file.slice(`src/features/${id}/`.length)))
    .map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));
}

function main(): void {
  const mapPath = join(root, featureMapFile);
  const stale = freshnessProblem(featureMapFile, renderFeatureMap(featureManifests), existsSync(mapPath) ? readFileSync(mapPath, "utf8") : undefined);
  const problems = [
    ...(stale === undefined ? [] : [stale]),
    ...featureManifests.flatMap((manifest) =>
      selectorProblems({
        id: manifest.id,
        selectors: manifest.selectors,
        uses: featureSources(manifest.id).flatMap(({ file, text }) => testIdsInSource(file, text)),
      }),
    ),
  ];
  if (problems.length > 0) {
    process.stderr.write(`${problems.map((problem) => `✖ ${problem}`).join("\n")}\n\n`);
    process.stderr.write(
      `featuremap: ${String(problems.length)} problem(s). Every data-testid in a feature's code is a selector in its manifest and the other way round, and ${featureMapFile} is what pnpm featuremap generates.\n`,
    );
    process.exitCode = 1;
    return;
  }
  const selectors = featureManifests.reduce((count, manifest) => count + Object.keys(manifest.selectors).length, 0);
  process.stdout.write(
    `featuremap: ok (${featureMapFile} is current; ${String(selectors)} selectors match the data-testids in ${featureManifests.map((manifest) => manifest.id).join(", ")})\n`,
  );
}

main();
