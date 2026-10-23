import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { labelCommand, LOOP_LABELS } from "./setup-labels/labels";

// pnpm setup:labels lists the labels the loop needs; --apply creates or updates them on the repo with gh.
// `gh label create --force` updates an existing label's colour and description, so it is safe to rerun.
const root = join(import.meta.dirname, "..");
const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });

let failed = 0;
for (const label of LOOP_LABELS) {
  if (!values.apply) {
    process.stdout.write(`${label.name} (#${label.color}): ${label.description}\n`);
    continue;
  }
  const result = spawnSync("gh", labelCommand(label), { cwd: root, encoding: "utf8" });
  if (result.status === 0) {
    process.stdout.write(`ok ${label.name}\n`);
  } else {
    failed += 1;
    process.stderr.write(`failed ${label.name}: ${result.stderr.trim()}\n`);
  }
}
if (!values.apply) process.stdout.write(`setup:labels: ${String(LOOP_LABELS.length)} labels. Rerun with --apply to create them.\n`);
if (failed > 0) process.exitCode = 1;
