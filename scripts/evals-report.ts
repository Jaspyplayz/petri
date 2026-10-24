// pnpm evals:report: the latest score per eval case and the average per skill, from evals/results.jsonl.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatReport, parseResults } from "./evals/results";

const file = join(import.meta.dirname, "..", "evals", "results.jsonl");
process.stdout.write(formatReport(existsSync(file) ? parseResults(readFileSync(file, "utf8")) : []));
