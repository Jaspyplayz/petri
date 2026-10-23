import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { manifestIdsInSource, registryIdsInSource } from "./check-features/manifests";
import { checkFeatures, type FeatureFolder } from "./check-features/structure";

const root = join(import.meta.dirname, "..");
const featuresDir = join(root, "src", "features");
const REGISTRY = "registry.ts";

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function readFolder(name: string): FeatureFolder {
  const dir = join(featuresDir, name);
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      return { path: toPosix(relative(dir, absolute)), content: readFileSync(absolute, "utf8") };
    });
  const manifestPath = join(dir, "feature.manifest.ts");
  const manifestIds = existsSync(manifestPath) ? manifestIdsInSource(readFileSync(manifestPath, "utf8")) : [];
  return { name, files, manifestIds };
}

function main(): void {
  const entries = readdirSync(featuresDir, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => readFolder(entry.name));
  const strayFiles = entries.filter((entry) => !entry.isDirectory() && entry.name !== REGISTRY).map((entry) => entry.name);
  const registry = registryIdsInSource(readFileSync(join(featuresDir, REGISTRY), "utf8"));

  const problems = [...registry.problems, ...checkFeatures({ folders, strayFiles, registryIds: registry.ids })];
  if (problems.length > 0) {
    process.stderr.write(`${problems.map((problem) => `✖ ${problem}`).join("\n")}\n\n`);
    process.stderr.write(
      `features: ${String(problems.length)} problem(s). Every feature starts from pnpm new:feature <id> and keeps its manifest, index, README, unit test and e2e test.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`features: ok (${folders.map((folder) => folder.name).join(", ")})\n`);
}

main();
