import { join } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { gh, issueNumberArg } from "./evolution/github-issue";
import { linkedIssue } from "./evolution/github-pr";
import { branchToDelete, CLOSED_PR_FIELDS, resetComment, safeBranchName, skipReason, type ClosedGhPr } from "./evolution/pr-closed";
import { loopSupabase } from "./evolution/supabase";

// pnpm evolution:pr-closed <pr number>: when an evolution PR was closed without merging, the feedback the build marked
// building on it goes back to triaged and loses the PR link. Only rows still building on this PR change, so rerunning
// it, or running it after a newer build took the feedback, does nothing. It also deletes the PR's evo/ branch, as GitHub
// does on merge, so the issue can be built again.
const root = join(import.meta.dirname, "..");
const usage = "usage: pnpm evolution:pr-closed <pr number>";

function branchSha(branch: string): string | undefined {
  try {
    return gh(root, ["api", `repos/{owner}/{repo}/git/ref/heads/${branch}`, "--jq", ".object.sha"]);
  } catch {
    return undefined;
  }
}

// Only after linkedIssue has checked the branch is the one the build derives from the issue, and safeBranchName has
// ruled out anything (# % ? ..) that would change the REST path the name is pasted into.
function deleteBranch(pr: ClosedGhPr): void {
  const branch = safeBranchName(pr.headRefName) ? branchToDelete(pr, branchSha(pr.headRefName)) : undefined;
  if (branch === undefined) {
    process.stdout.write(`pr-closed: keeping ${pr.headRefName} (gone already, moved on since the close, or not an evo/ branch here)\n`);
    return;
  }
  gh(root, ["api", "-X", "DELETE", `repos/{owner}/{repo}/git/refs/heads/${branch}`]);
  process.stdout.write(`pr-closed: deleted ${branch}; #${String(pr.number)} keeps its commits\n`);
}

async function main(): Promise<void> {
  const number = issueNumberArg(process.argv[2], usage);
  const pr = JSON.parse(gh(root, ["pr", "view", String(number), "--json", CLOSED_PR_FIELDS])) as ClosedGhPr;
  const skip = skipReason(pr, loadGuardrailsConfig(root));
  if (skip !== undefined) {
    process.stdout.write(`pr-closed: ${skip}, so nothing changes\n`);
    return;
  }
  const issue = linkedIssue(root, pr, { allowClosed: true });
  if (typeof issue === "string") throw new Error(`pr-closed: can't trust #${String(number)}'s issue: ${issue}`);
  deleteBranch(pr);
  const update = await loopSupabase()
    .from("feedback")
    .update({ status: "triaged", pr_url: null })
    .in("id", [...issue.feedbackIds])
    .eq("status", "building")
    .eq("pr_url", pr.url)
    .select("id");
  if (update.error) throw new Error(`pr-closed: resetting the feedback failed: ${update.error.message}`);
  const count = update.data.length;
  process.stdout.write(`pr-closed: ${String(count)} feedback item(s) of #${String(issue.number)} → triaged\n`);
  if (count > 0) gh(root, ["issue", "comment", String(issue.number), "--body", resetComment(pr.number, count)]);
}

await main();
