import { appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { prDataFromBody } from "./evolution/build";
import { readEvolutionConfig } from "./evolution/config";
import { gh } from "./evolution/github-issue";
import { isEvolutionPr, linkedIssue, PR_FIELDS, type GhPr } from "./evolution/github-pr";
import { isGuardianRevert, parseRevertBranch } from "./evolution/guardian";
import {
  changelogRow,
  mergedPrNumber,
  postMergePassed,
  revertedChangeProblem,
  revertRow,
  vercelDeployment,
  type CommitPr,
  type CommitStatus,
} from "./evolution/post-merge";
import { loopSupabase } from "./evolution/supabase";

// pnpm evolution:post-merge record|finish runs from main after a push (evolution-post-merge.yml).
// record: if the pushed commit is a merged evolution PR, wait for Vercel's production deployment, insert its changelog
//   row (once per PR), mark its feedback shipped and comment on its issue. If it's a merged guardian revert, insert
//   the "Reverted" row (once per PR). Writes kind (none, change or revert), pr, issue, started-at and production-url
//   to $GITHUB_OUTPUT.
// finish: after verify:all --read-only ran against production (changes only), record the run in agent_runs and, if
//   anything failed, comment on the PR and exit 1.
const root = join(import.meta.dirname, "..");
const DEPLOY_TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 15_000;

type MergedGhPr = GhPr & { readonly url: string; readonly mergedAt: string | null };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set`);
  return value;
}

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`);
  if (file) appendFileSync(file, lines.join(""));
  process.stdout.write(lines.map((line) => `post-merge: ${line}`).join(""));
}

async function waitForProduction(repo: string, sha: string): Promise<void> {
  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  for (;;) {
    const statuses = (JSON.parse(gh(root, ["api", "--paginate", "--slurp", `repos/${repo}/commits/${sha}/statuses`])) as CommitStatus[][]).flat();
    const state = vercelDeployment(statuses);
    if (state === "ready") return;
    if (state === "failed") throw new Error(`Vercel's production deployment of ${sha} failed`);
    if (Date.now() > deadline) throw new Error(`Vercel didn't finish deploying ${sha} within ${String(DEPLOY_TIMEOUT_MS / 60_000)} minutes`);
    process.stdout.write("post-merge: waiting for Vercel's production deployment\n");
    await sleep(POLL_MS);
  }
}

async function record(): Promise<void> {
  output({ "started-at": new Date().toISOString() });
  const repo = env("GITHUB_REPOSITORY");
  const sha = env("GITHUB_SHA");
  const number = mergedPrNumber(JSON.parse(gh(root, ["api", `repos/${repo}/commits/${sha}/pulls`])) as CommitPr[], sha);
  if (number === undefined) {
    output({ kind: "none" });
    process.stdout.write(`post-merge: ${sha} isn't the merge of a PR into main\n`);
    return;
  }
  const pr = JSON.parse(gh(root, ["pr", "view", String(number), "--json", `${PR_FIELDS},url,mergedAt`])) as MergedGhPr;
  if (isGuardianRevert(pr)) {
    await recordRevert(pr, sha);
    return;
  }
  if (!isEvolutionPr(pr, loadGuardrailsConfig(root))) {
    output({ kind: "none" });
    process.stdout.write(`post-merge: #${String(number)} isn't an evolution PR, so it doesn't go on the Timeline\n`);
    return;
  }
  const { trustLevel, productionUrl } = readEvolutionConfig(root);
  output({ kind: "change", pr: String(number), "production-url": productionUrl });
  const issue = linkedIssue(root, pr, { allowClosed: true });
  if (typeof issue === "string") throw new Error(`#${String(number)} was merged, but ${issue}`);
  output({ issue: String(issue.number) });
  const data = prDataFromBody(pr.body);
  if (data === undefined || pr.mergedAt === null) throw new Error(`#${String(number)} has no data comment or merge time`);

  await waitForProduction(repo, sha);
  const supabase = loopSupabase();
  const existing = await supabase.from("changelog").select("id").eq("kind", "change").eq("pr_number", number).maybeSingle();
  if (existing.error) throw new Error(`reading the changelog failed: ${existing.error.message}`);
  // A rerun keeps the one row and its one comment, but still marks the feedback shipped (that update is idempotent).
  let id = existing.data?.id;
  if (id === undefined) {
    const row = changelogRow({ issue, pr: { number, url: pr.url, body: pr.body, mergedAt: pr.mergedAt, sha }, data, trustLevel, supabaseUrl: env("NEXT_PUBLIC_SUPABASE_URL") });
    const inserted = await supabase.from("changelog").insert(row).select("id").single();
    if (inserted.error) throw new Error(`inserting the changelog row failed: ${inserted.error.message}`);
    id = inserted.data.id;
    const timeline = new URL("/timeline", productionUrl).toString();
    gh(root, ["issue", "comment", String(issue.number), "--body", `Shipped in #${String(number)} (${sha.slice(0, 7)}). It's on the Timeline: ${timeline}`]);
  }
  const shipped = await supabase.from("feedback").update({ status: "shipped", pr_url: pr.url }).in("id", [...issue.feedbackIds]);
  if (shipped.error) throw new Error(`marking the feedback shipped failed: ${shipped.error.message}`);
  process.stdout.write(`post-merge: #${String(number)} is on the Timeline (${id}); ${String(issue.feedbackIds.length)} feedback item(s) shipped\n`);
}

// A merged guardian revert (isGuardianRevert: its branch, label and incident marker) goes on the Timeline as
// "Reverted", linked to the change it undid. The branch names that change's PR and commit, and its row has to match
// both. Production serves the rollback until the guardian promotes the revert's deployment, so there's no deployment to
// wait for or verify here.
async function recordRevert(pr: MergedGhPr, sha: string): Promise<void> {
  const reverted = parseRevertBranch(pr.headRefName);
  if (reverted === undefined) throw new Error(`${pr.headRefName} isn't a guardian revert branch`);
  output({ kind: "revert", pr: String(pr.number) });
  if (pr.mergedAt === null) throw new Error(`#${String(pr.number)} has no merge time`);
  const supabase = loopSupabase();
  const original = await supabase.from("changelog").select("id,title,feedback_ids,commit_sha").eq("kind", "change").eq("pr_number", reverted.pr).maybeSingle();
  if (original.error) throw new Error(`reading the changelog failed: ${original.error.message}`);
  const problem = revertedChangeProblem(original.data, reverted);
  if (problem !== undefined || original.data === null) throw new Error(`#${String(pr.number)} reverts #${String(reverted.pr)} (${reverted.sha7}), but ${problem ?? "it has no row"}`);
  const existing = await supabase.from("changelog").select("id").eq("kind", "revert").eq("pr_number", pr.number).maybeSingle();
  if (existing.error) throw new Error(`reading the changelog failed: ${existing.error.message}`);
  let id = existing.data?.id;
  if (id === undefined) {
    const row = revertRow({ reverted: original.data, pr: { number: pr.number, url: pr.url, mergedAt: pr.mergedAt, sha }, trustLevel: readEvolutionConfig(root).trustLevel });
    const inserted = await supabase.from("changelog").insert(row).select("id").single();
    if (inserted.error) throw new Error(`inserting the revert's changelog row failed: ${inserted.error.message}`);
    id = inserted.data.id;
  }
  process.stdout.write(`post-merge: the revert #${String(pr.number)} of #${String(reverted.pr)} is on the Timeline (${id})\n`);
}

async function finish(): Promise<void> {
  const pr = Number(env("PR"));
  const issue = process.env.ISSUE ? Number(process.env.ISSUE) : null;
  const kind = process.env.KIND === "revert" ? "revert" : "change";
  const outcomes = { record: env("RECORD_OUTCOME"), verify: process.env.VERIFY_OUTCOME || "skipped" };
  const passed = postMergePassed(kind, outcomes);
  const runUrl = `${env("GITHUB_SERVER_URL")}/${env("GITHUB_REPOSITORY")}/actions/runs/${env("GITHUB_RUN_ID")}`;
  const startedAt = process.env.STARTED_AT || new Date().toISOString();
  const finishedAt = new Date();
  const run = await loopSupabase()
    .from("agent_runs")
    .insert({
      workflow: "post-merge",
      gh_run_id: Number(env("GITHUB_RUN_ID")),
      gh_run_url: runUrl,
      issue_number: issue,
      pr_number: pr,
      status: passed ? "pass" : "fail",
      duration_ms: Math.max(0, finishedAt.getTime() - Date.parse(startedAt)),
      started_at: startedAt,
      finished_at: finishedAt.toISOString(),
      details: { commit: env("GITHUB_SHA"), kind, ...outcomes },
    });
  if (run.error) throw new Error(`recording the run failed: ${run.error.message}`);
  process.stdout.write(`post-merge: recorded the run (${passed ? "pass" : "fail"}: ${kind}, record ${outcomes.record}, verify ${outcomes.verify})\n`);
  if (passed) return;
  const what =
    outcomes.record !== "success"
      ? `Putting this ${kind === "revert" ? "revert" : "PR"} on the Timeline failed`
      : "Production verification (`verify:all --read-only`) failed";
  gh(root, ["pr", "comment", String(pr), "--body", `${what} after the merge. Evidence: ${runUrl}`]);
  process.exitCode = 1;
}

const command = process.argv[2];
if (command === "record") await record();
else if (command === "finish") await finish();
else throw new Error("usage: pnpm evolution:post-merge <record|finish>");
