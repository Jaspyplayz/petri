import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { checkFeatures, type FeatureFolder, manifestIdsOf } from "./check-features/structure";

const root = join(import.meta.dirname, "..");
const featuresDir = join(root, "src", "features");
const REGISTRY = "registry.ts";

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

async function exportsOf(path: string): Promise<Readonly<Record<string, unknown>>> {
  const loaded: unknown = await import(pathToFileURL(path).href);
  if (typeof loaded !== "object" || loaded === null) return {};
  const entries: [string, unknown][] = Object.entries(loaded);
  return Object.fromEntries(entries);
}

async function readFolder(name: string): Promise<FeatureFolder> {
  const dir = join(featuresDir, name);
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      return { path: toPosix(relative(dir, absolute)), content: readFileSync(absolute, "utf8") };
    });
  const manifestPath = join(dir, "feature.manifest.ts");
  const manifestIds = existsSync(manifestPath) ? manifestIdsOf(await exportsOf(manifestPath)) : [];
  return { name, files, manifestIds };
}

async function registryIds(): Promise<string[]> {
  const registry = await exportsOf(join(featuresDir, REGISTRY));
  const listed: unknown = registry.featureManifests;
  const manifests: unknown[] = Array.isArray(listed) ? listed : [];
  return manifestIdsOf(Object.fromEntries(manifests.map((manifest, index) => [String(index), manifest])));
}

async function main(): Promise<void> {
  const entries = readdirSync(featuresDir, { withFileTypes: true });
  const folders = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readFolder(entry.name)));
  const strayFiles = entries.filter((entry) => !entry.isDirectory() && entry.name !== REGISTRY).map((entry) => entry.name);

  const problems = checkFeatures({ folders, strayFiles, registryIds: await registryIds() });
  if (problems.length > 0) {
    process.stderr.write(`${problems.map((problem) => `✖ ${problem}`).join("\n")}\n\n`);
    process.stderr.write(
      `features: ${String(problems.length)} problem(s). Every feature starts from pnpm new:feature <id> and keeps its manifest, index, README, unit test and e2e test.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`features: ok (${folders.map((folder) => folder.name).join(", ")})\n`);
}

await main();
