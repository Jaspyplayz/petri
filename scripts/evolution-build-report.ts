import { appendFileSync, readFileSync } from "node:fs";
import { z } from "zod";
import { builderReportSchema } from "./evolution/build";
import { defang } from "./evolution/triage-output";

// pnpm evolution:build-report <report.json> validates the builder's structured output and writes outcome, flows
// (space separated, each checked against the flow-name pattern) and reason to $GITHUB_OUTPUT.
function main(): void {
  const file = process.argv[2];
  if (file === undefined) throw new Error("usage: pnpm evolution:build-report <report.json>");
  const parsed = builderReportSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`the builder's report doesn't match the schema: ${z.prettifyError(parsed.error)}`);
  const report = parsed.data;
  const reason = defang(report.blockedReason ?? "").replace(/\s+/g, " ");
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `outcome=${report.outcome}\nflows=${report.flows.join(" ")}\nreason=${reason}\n`);
  process.stdout.write(`build-report: ${report.outcome}; flows ${report.flows.join(", ")}${reason ? `; ${reason}` : ""}\n`);
}

main();
