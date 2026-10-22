import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findServerLeaks, formatReport, isClientEntrySource, parseCruiseResult } from "./check-boundaries/graph.ts";

const root = join(import.meta.dirname, "..");
const depcruiseBin = join(root, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");

const cruise = spawnSync(
  process.execPath,
  [depcruiseBin, "src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
  { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);
if (cruise.error || cruise.stdout.trim() === "") {
  process.stderr.write(`boundaries: dependency-cruiser did not run\n${cruise.stderr}\n`);
  process.exit(1);
}

const result = parseCruiseResult(cruise.stdout);
const leaks = findServerLeaks(
  result.modules,
  (source) => source.startsWith("src/") && isClientEntrySource(readFileSync(join(root, source), "utf8")),
);
const { violations } = result.summary;

if (violations.length > 0 || leaks.length > 0) {
  process.stderr.write(`${formatReport(violations, leaks)}\n\n`);
  process.stderr.write(
    `boundaries: ${String(violations.length)} import-rule violation(s), ${String(leaks.length)} client→server-only leak(s).\n` +
      "Features import only src/shared/ and their own files; routes import features only via index.ts; client components never reach server-only code.\n",
  );
  process.exit(1);
}

process.stdout.write(
  `boundaries: ok (${String(result.modules.length)} modules; import rules and client→server-only reachability checked)\n`,
);
