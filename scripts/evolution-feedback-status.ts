import { join } from "node:path";
import { fetchIssue, issueNumberArg } from "./evolution/github-issue";
import { loopSupabase } from "./evolution/supabase";

// pnpm evolution:feedback-status <building|shipped> <issue number> [pr url] sets the status of the feedback the
// issue links to. It reads the feedback ids from the issue on GitHub, never from a file an agent could have written.
const root = join(import.meta.dirname, "..");
const statuses = ["building", "shipped"] as const;
const usage = `usage: pnpm evolution:feedback-status <${statuses.join("|")}> <issue number> [pr url]`;

async function main(): Promise<void> {
  const status = statuses.find((name) => name === process.argv[2]);
  if (status === undefined) throw new Error(usage);
  const issue = fetchIssue(root, issueNumberArg(process.argv[3], usage), { requireReady: false });
  const prUrl = process.argv[4];
  if (prUrl !== undefined && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(prUrl)) throw new Error(`not a pull request URL: ${prUrl}`);
  const update = await loopSupabase()
    .from("feedback")
    .update({ status, ...(prUrl ? { pr_url: prUrl } : {}) })
    .in("id", [...issue.feedbackIds]);
  if (update.error) throw new Error(`setting feedback to ${status} failed: ${update.error.message}`);
  process.stdout.write(`feedback-status: ${String(issue.feedbackIds.length)} feedback item(s) of #${String(issue.number)} → ${status}\n`);
}

await main();
