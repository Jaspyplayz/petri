import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  featureFiles,
  registryFile,
  routePageFile,
  validateFeatureId,
  validateRoute,
  type GeneratedFile,
} from "./new-feature/templates";

const root = join(import.meta.dirname, "..");
const featuresDir = join(root, "src", "features");

function fail(message: string): never {
  process.stderr.write(`new:feature: ${message}\n`);
  process.exit(1);
}

function writeFile(file: GeneratedFile): void {
  const absolute = join(root, file.path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, file.content);
  process.stdout.write(`  created ${file.path}\n`);
}

function listFeatureIds(): string[] {
  if (!existsSync(featuresDir)) return [];
  return readdirSync(featuresDir).filter(
    (name) =>
      statSync(join(featuresDir, name)).isDirectory() && existsSync(join(featuresDir, name, "feature.manifest.ts")),
  );
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      route: { type: "string" },
      "registry-only": { type: "boolean", default: false },
    },
  });

  if (values["registry-only"]) {
    writeFile(registryFile(listFeatureIds()));
    return;
  }

  const id = positionals[0];
  if (!id) fail("usage: pnpm new:feature <id> [--route /path]");

  const idError = validateFeatureId(id);
  if (idError) fail(idError);

  const route = values.route ?? `/${id}`;
  const routeError = validateRoute(route);
  if (routeError) fail(routeError);

  if (existsSync(join(featuresDir, id))) fail(`src/features/${id} already exists.`);

  process.stdout.write(`Creating feature "${id}" at route ${route}\n`);
  for (const file of featureFiles({ id, route })) writeFile(file);

  const page = routePageFile({ id, route });
  if (existsSync(join(root, page.path))) {
    process.stdout.write(`  skipped ${page.path} (exists): compose <${id}> from "@/features/${id}" there by hand\n`);
  } else {
    writeFile(page);
  }

  writeFile(registryFile(listFeatureIds()));
  process.stdout.write(
    `\nNext: fill in feature.manifest.ts and README.md, then run pnpm typecheck && pnpm test.\n`,
  );
}

main();
