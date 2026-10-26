import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { IssueJson } from "./evolution/build";
import { planFiles, verifyPlanSchema } from "./evolution/verdict";

// pnpm evolution:verify-plan <plan.json> <issue.json> <out dir> checks the planner's JSON and writes one verify script
// per entry. The planner only ever returns JSON; this script is what writes files.
function main(): void {
  const [planFile, issueFile, outDir] = process.argv.slice(2);
  if (planFile === undefined || issueFile === undefined || outDir === undefined) {
    throw new Error("usage: pnpm evolution:verify-plan <plan.json> <issue.json> <out dir>");
  }
  const parsed = verifyPlanSchema.safeParse(JSON.parse(readFileSync(planFile, "utf8")));
  if (!parsed.success) throw new Error(`the verify plan doesn't match the schema: ${z.prettifyError(parsed.error)}`);
  const issue = JSON.parse(readFileSync(issueFile, "utf8")) as IssueJson;
  const files = planFiles(parsed.data, issue.acceptanceCriteria.length);
  mkdirSync(outDir, { recursive: true });
  for (const { file, json } of files) writeFileSync(join(outDir, file), json);
  process.stdout.write(`verify-plan: ${String(files.length)} script(s) for ${String(issue.acceptanceCriteria.length)} criteria: ${files.map((entry) => entry.file).join(", ")}\n`);
}

main();
