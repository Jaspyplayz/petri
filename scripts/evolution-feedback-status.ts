import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuiltIssue } from "./evolution/build";
import { loopSupabase } from "./evolution/supabase";

// pnpm evolution:feedback-status <building|shipped> [pr url] sets the status of the feedback linked to
// artifacts/evolution/issue.json.
const root = join(import.meta.dirname, "..");
const statuses = ["building", "shipped"] as const;

async function main(): Promise<void> {
  const status = statuses.find((name) => name === process.argv[2]);
  if (status === undefined) throw new Error(`usage: pnpm evolution:feedback-status <${statuses.join("|")}> [pr url]`);
  const prUrl = process.argv[3];
  const issue = JSON.parse(readFileSync(join(root, "artifacts", "evolution", "issue.json"), "utf8")) as BuiltIssue;
  const update = await loopSupabase()
    .from("feedback")
    .update({ status, ...(prUrl ? { pr_url: prUrl } : {}) })
    .in("id", [...issue.feedbackIds]);
  if (update.error) throw new Error(`setting feedback to ${status} failed: ${update.error.message}`);
  process.stdout.write(`feedback-status: ${String(issue.feedbackIds.length)} feedback item(s) of #${String(issue.number)} → ${status}\n`);
}

await main();
