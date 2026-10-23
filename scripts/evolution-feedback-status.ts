import { join } from "node:path";
import { fetchIssue, issueNumberArg } from "./evolution/github-issue";
import { loopSupabase } from "./evolution/supabase";

// pnpm evolution:feedback-status <building|shipped|triaged> <issue number> [pr url] sets the status of the feedback
// the issue links to. It reads the feedback ids from the issue on GitHub, never from a file an agent could have written.
// triaged undoes a build that produced no PR: it only moves rows that are still building, and takes no PR url.
const root = join(import.meta.dirname, "..");
const statuses = ["building", "shipped", "triaged"] as const;
const usage = `usage: pnpm evolution:feedback-status <${statuses.join("|")}> <issue number> [pr url]`;

async function main(): Promise<void> {
  const status = statuses.find((name) => name === process.argv[2]);
  if (status === undefined) throw new Error(usage);
  const issue = fetchIssue(root, issueNumberArg(process.argv[3], usage), { requireReady: false });
  const prUrl = process.argv[4];
  if (prUrl !== undefined && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(prUrl)) throw new Error(`not a pull request URL: ${prUrl}`);
  if (status === "triaged" && prUrl !== undefined) throw new Error(usage);
  const update = loopSupabase()
    .from("feedback")
    .update({ status, ...(prUrl ? { pr_url: prUrl } : {}) })
    .in("id", [...issue.feedbackIds]);
  const result = await (status === "triaged" ? update.eq("status", "building") : update).select("id");
  if (result.error) throw new Error(`setting feedback to ${status} failed: ${result.error.message}`);
  process.stdout.write(`feedback-status: ${String(result.data.length)} feedback item(s) of #${String(issue.number)} → ${status}\n`);
}

await main();
