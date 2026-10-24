import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadGuardrailsConfig } from "./check-pr/config";
import { CONFIG_PATH, PAUSED_PATH, readEvolutionConfig } from "./evolution/config";
import { gh } from "./evolution/github-issue";
import { isEvolutionPr, PR_FIELDS, type GhPr } from "./evolution/github-pr";
import {
  afterDeployChecks,
  checkWindows,
  culpritCommit,
  deployState,
  GUARDIAN_BRANCH_PREFIX,
  GUARDIAN_ISSUE_LABEL,
  guardianRunStatus,
  incidentMarker,
  incidentRevert,
  loweredTrust,
  nextPause,
  parseStepOutcomes,
  pauseBranch,
  productionState,
  promoteBlock,
  promoteTarget,
  revertBranch,
  rolledBackFrom,
  spikeVerdict,
  type AliasRequest,
  type Deployed,
  type ListedPr,
  type MainCommit,
  type MergedRevert,
  type Production,
  type VercelDeployment,
} from "./evolution/guardian";
import {
  lastAliasRequest,
  productionDeployments,
  promoteDeployment,
  rollBack,
  sentryNumbers,
  servingDeploymentId,
  type SentryAccess,
  type VercelAccess,
} from "./evolution/guardian-api";
import {
  incidentSummary,
  notifyIssue,
  pausePrBody,
  pauseTitle,
  promotedComment,
  promoteUnconfirmedComment,
  retriedRollbackComment,
  revertPrBody,
  revertTitle,
  type Changes,
  type Incident,
  type Opened,
  type Outcome,
} from "./evolution/guardian-report";
import { mergedPrNumber, type CommitPr } from "./evolution/post-merge";
import { loopSupabase } from "./evolution/supabase";
import { labelCommand, LOOP_LABELS } from "./setup-labels/labels";
import { REVERT_LABEL } from "./trust-report/ladder";

// pnpm evolution:guardian <command> runs from main in evolution-guardian.yml, one step per command:
// check: compare the release production serves with the one before it in Sentry, and find the evolution merge that
//   went live with it. Writes the state for the later steps and the spike, handled, culprit and branch outputs. While
//   the guardian's rollback holds production, it looks for the merged revert instead (the promote output).
//   Changes nothing.
// promote: put the deployment that has the merged revert live, which turns Vercel's automatic deploys back on.
// rollback: point production back at the previous deployment and wait until the production URL serves it.
// pause-files <dir>: in the pause worktree, extend .evolution/PAUSED and lower trustLevel, as guardrails allow agents to.
// open-pr <pause|revert>: open that PR from the pushed branch and turn auto-merge on for the pushed commit.
// notify: open the issue that tells the maintainer what happened and what's left to do.
// record: write the run to agent_runs when it found a spike or something to promote, or the check failed.
// And in evolution-guardian-after-deploy.yml:
// after-deploy: wait until production serves SHA's deployment, then dispatch evolution-guardian.yml 10, 30 and 60
//   minutes after it went live.
const root = join(import.meta.dirname, "..");
const state = join(process.env.RUNNER_TEMP ?? tmpdir(), "guardian");
const ALIAS_WAIT_MS = 3 * 60_000;
const POLL_MS = 10_000;
// How long after-deploy waits for the pushed commit's deployment to go live (a build takes a few minutes).
const DEPLOY_WAIT_MS = 20 * 60_000;
const DEPLOY_POLL_MS = 30_000;
// Commits that went live with one deployment; a longer gap between deployments isn't searched for its change.
const MAX_COMMITS = 20;

type Handled = { readonly url: string; readonly kind: "issue" | "pr" };
// from: the deployment the rollback replaced, which names the incident. servingId: what production served at the check.
type Promotion = { readonly from: string; readonly servingId: string; readonly revert: MergedRevert; readonly target: Deployed };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set`);
  return value;
}

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`);
  if (file) appendFileSync(file, lines.join(""));
  process.stdout.write(lines.map((line) => `guardian: ${line}`).join(""));
}

function stepSummary(text: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${text}\n`);
  process.stdout.write(`${text}\n`);
}

function save(name: string, value: unknown): void {
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, name), `${JSON.stringify(value, null, 2)}\n`);
}

// The earlier steps of the same job wrote these files with this script.
function load(name: string): unknown {
  const path = join(state, name);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function incident(): Incident {
  const saved = load("incident.json") as Incident | undefined;
  if (saved === undefined) throw new Error("run `evolution:guardian check` first");
  return saved;
}

function vercelAccess(): VercelAccess {
  return { token: env("VERCEL_TOKEN"), projectId: env("VERCEL_PROJECT_ID"), teamId: env("VERCEL_ORG_ID") };
}

function sentryAccess(): SentryAccess {
  return { token: env("SENTRY_AUTH_TOKEN"), org: env("SENTRY_ORG"), project: env("SENTRY_PROJECT") };
}

function productionHost(): string {
  return new URL(readEvolutionConfig(root).productionUrl).host;
}

function runUrl(): string {
  return `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? "local"}/actions/runs/${process.env.GITHUB_RUN_ID ?? "0"}`;
}

// Waits until the production URL serves the deployment, at most ALIAS_WAIT_MS.
async function servesWithin(vercel: VercelAccess, host: string, deploymentId: string): Promise<boolean> {
  const deadline = Date.now() + ALIAS_WAIT_MS;
  while ((await servingDeploymentId(vercel, host)) !== deploymentId) {
    if (Date.now() > deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}

function git(args: readonly string[]): string | undefined {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

// The commits on main that went live with this deployment, newest first, each with the PR it merged (if any).
// Without a previous deployment only the serving commit is known to be new. A redeploy of the previous commit (or a
// range git can't read) brings no new commit, so nothing is blamed.
function liveCommits(serving: string, previous: string | undefined): MainCommit[] {
  const shas =
    previous === undefined
      ? [serving]
      : (git(["rev-list", "--first-parent", `--max-count=${String(MAX_COMMITS)}`, `${previous}..${serving}`]) ?? "").split(/\r?\n/).filter((sha) => sha !== "");
  const guardrails = loadGuardrailsConfig(root);
  return shas.map((sha) => {
    const number = mergedPrNumber(JSON.parse(gh(root, ["api", `repos/{owner}/{repo}/commits/${sha}/pulls`])) as CommitPr[], sha);
    if (number === undefined) return { sha, pr: undefined };
    const pr = JSON.parse(gh(root, ["pr", "view", String(number), "--json", `${PR_FIELDS},url`])) as GhPr & { readonly url: string };
    return { sha, pr: { number, title: pr.title, url: pr.url, evolution: isEvolutionPr(pr, guardrails) } };
  });
}

function openIncidentIssue(servingId: string): { readonly url: string; readonly labels: string[] } | undefined {
  const marker = incidentMarker(servingId);
  const fields = "url,body,labels";
  const issues = JSON.parse(gh(root, ["issue", "list", "--state", "open", "--label", GUARDIAN_ISSUE_LABEL, "--limit", "50", "--json", fields])) as {
    url: string;
    body: string;
    labels: { name: string }[];
  }[];
  const issue = issues.find((item) => item.body.includes(marker));
  return issue === undefined ? undefined : { url: issue.url, labels: issue.labels.map((label) => label.name) };
}

// The guardian's open issue or PR for this deployment, when an earlier run already acted on it. Then only the
// rollback is retried: the PRs and the issue exist.
function handledBy(servingId: string): Handled | undefined {
  const marker = incidentMarker(servingId);
  const issue = openIncidentIssue(servingId);
  if (issue !== undefined) return { url: issue.url, kind: "issue" };
  const prs = JSON.parse(gh(root, ["pr", "list", "--state", "open", "--base", "main", "--limit", "100", "--json", "url,body,headRefName"])) as {
    url: string;
    body: string;
    headRefName: string;
  }[];
  const pr = prs.find((item) => item.headRefName.startsWith(GUARDIAN_BRANCH_PREFIX) && item.body.includes(marker));
  return pr === undefined ? undefined : { url: pr.url, kind: "pr" };
}

function attempt<T>(what: string, problems: string[], run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    problems.push(`${what}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500));
    return undefined;
  }
}

// What Vercel answered, so a dry run shows the fields the guardian relies on.
function vercelLine(deployments: readonly VercelDeployment[], aliasRequest: AliasRequest | undefined): string {
  const ready = deployments.filter((deployment) => deployment.state === "READY" && deployment.target === "production");
  const served = ready.filter((deployment) => deployment.readySubstate === "PROMOTED").length;
  const last = aliasRequest === undefined ? "none" : `${aliasRequest.type} to ${aliasRequest.toDeploymentId} at ${new Date(aliasRequest.requestedAt).toISOString()}`;
  return `- **Vercel:** ${String(ready.length)} ready production deployments listed, ${String(served)} of them have served production; last promote or rollback: ${last}`;
}

// While the guardian's rollback holds production, the way back to normal deploys is promoting a deployment that has
// the merged revert. Says what it found, for the summary, and saves the plan when there's something to promote.
function planPromotion(deployments: readonly VercelDeployment[], servingId: string, aliasRequest: AliasRequest | undefined): string | undefined {
  const from = rolledBackFrom(servingId, aliasRequest);
  if (from === undefined) return undefined;
  const fields = "number,url,body,headRefName,isCrossRepository,labels,mergeCommit";
  const prs = JSON.parse(gh(root, ["pr", "list", "--state", "merged", "--base", "main", "--label", REVERT_LABEL, "--limit", "30", "--json", fields])) as ListedPr[];
  const revert = incidentRevert(prs, from);
  if (revert === undefined) return `production was rolled back from ${from}, and no guardian revert of it has merged yet, so there's nothing to promote`;
  const number = `#${String(revert.number)}`;
  const pausedPath = join(root, PAUSED_PATH);
  const block = promoteBlock(existsSync(pausedPath) ? readFileSync(pausedPath, "utf8") : undefined, new Date(), openIncidentIssue(from)?.labels ?? []);
  if (block !== undefined) return `the revert ${number} merged, but ${block}`;
  const target = promoteTarget(deployments, servingId, (sha) => git(["merge-base", "--is-ancestor", revert.mergeCommit, sha]) !== undefined);
  if (target === undefined) return `the revert ${number} merged, but no ready production deployment has it yet, so there's nothing to promote`;
  const plan: Promotion = { from, servingId, revert, target };
  save("promote.json", plan);
  output({ promote: target.id });
  const act = process.env.ACT === "true";
  return `the revert ${number} merged, and ${target.url ?? target.id} (\`${target.sha.slice(0, 7)}\`) has it, so ${act ? "the guardian promotes it" : "**dry run:** acting would promote it"}`;
}

async function readProduction(vercel: VercelAccess): Promise<{
  readonly deployments: VercelDeployment[];
  readonly servingId: string;
  readonly aliasRequest: AliasRequest | undefined;
  readonly production: Production;
}> {
  const [deployments, servingId, aliasRequest] = await Promise.all([
    productionDeployments(vercel),
    servingDeploymentId(vercel, productionHost()),
    lastAliasRequest(vercel),
  ]);
  return { deployments, servingId, aliasRequest, production: productionState(deployments, servingId, aliasRequest) };
}

async function check(): Promise<void> {
  output({ "started-at": new Date().toISOString() });
  const config = readEvolutionConfig(root);
  const vercel = vercelAccess();
  const { deployments, servingId, aliasRequest, production } = await readProduction(vercel);
  if (production.kind === "held") {
    output({ spike: "false" });
    // A lookup that fails here only delays the promote to the next run, so it's reported, not thrown.
    const problems: string[] = [];
    const promotion = attempt("looking for the merged revert to promote", problems, () => planPromotion(deployments, servingId, aliasRequest));
    const next = [promotion === undefined ? undefined : `After the rollback: ${promotion}.`, ...problems.map((problem) => `**Lookup failed:** ${problem}`)];
    stepSummary(["## Guardian", `Not checking: ${production.reason}.`, ...next.filter((line) => line !== undefined), vercelLine(deployments, aliasRequest)].join("\n\n"));
    // Production is held and Vercel's last promote or rollback failed (a promote the guardian started, say): a human
    // has to look, so the run goes red on every check until one does.
    if (aliasRequest?.jobStatus === "failed") {
      throw new Error(`Vercel's last ${aliasRequest.type} (to ${aliasRequest.toDeploymentId}) failed while production is held: ${production.reason}`);
    }
    return;
  }
  const { serving, previous } = production;
  const now = new Date();
  const windows = checkWindows(serving.liveAt, previous?.liveAt, now, config.sentry.windowMinutes);
  const numbers = await sentryNumbers(sentryAccess(), { serving: serving.sha, previous: previous?.sha, ...windows });
  const verdict = spikeVerdict(numbers, config.sentry, (now.getTime() - serving.liveAt) / 60_000);
  // The GitHub lookups can't stop a rollback: a failed one leaves no culprit (so no PRs) and is reported.
  const problems: string[] = [];
  const found = attempt("finding the evolution change that went live", problems, () => culpritCommit(liveCommits(serving.sha, previous?.sha)));
  const lookedUp = verdict.spike ? attempt("looking for an earlier run's issue or PR", problems, () => ({ handled: handledBy(serving.id) })) : { handled: undefined };
  const handled = lookedUp?.handled;
  if (handled !== undefined) save("handled.json", handled);
  if (lookedUp === undefined) save("prs-skipped.json", true);
  const result: Incident = {
    checkedAt: now.toISOString(),
    serving,
    previous,
    currentWindow: { start: windows.current.start.toISOString(), end: windows.current.end.toISOString() },
    numbers,
    verdict,
    culprit: found === undefined ? undefined : { sha: found.sha, pr: { number: found.pr.number, title: found.pr.title, url: found.pr.url } },
    problems,
    runUrl: runUrl(),
  };
  save("incident.json", result);
  output({
    spike: String(verdict.spike),
    handled: lookedUp === undefined ? "unknown" : (handled?.url ?? ""),
    previous: previous?.id ?? "",
    culprit: found?.sha ?? "",
    pr: found === undefined ? "" : String(found.pr.number),
    pause_branch: found === undefined ? "" : pauseBranch(found.pr.number, found.sha),
    revert_branch: found === undefined ? "" : revertBranch(found.pr.number, found.sha),
  });
  const act = process.env.ACT === "true";
  const target = previous?.id ?? "nothing (no previous deployment)";
  const plan = !verdict.spike
    ? ""
    : handled !== undefined
      ? `\n\nAn earlier run already acted on this deployment (${handled.url}), so ${act ? "only the rollback is retried" : "acting would only retry the rollback"}.`
      : lookedUp === undefined
        ? `\n\nIt couldn't tell whether an earlier run already acted, so ${act ? "it only rolls back and opens an issue" : "acting would only roll back and open an issue"}.`
        : act
        ? "\n\nActing on it: rollback, pause PR, revert PR, notify."
        : `\n\n**Dry run:** acting would roll production back to ${target}${found === undefined ? "" : `, open a PR that pauses the loop and lowers trust, revert #${String(found.pr.number)}`} and open an issue.`;
  stepSummary(`## Guardian\n\n${incidentSummary(result, config.sentry)}\n${vercelLine(deployments, aliasRequest)}${plan}`);
}

async function rollback(): Promise<void> {
  const { serving, previous, verdict } = incident();
  if (previous === undefined) {
    save("rollback.json", { result: "skipped" });
    process.stdout.write("guardian: no previous production deployment, so there's nothing to roll back to\n");
    return;
  }
  const vercel = vercelAccess();
  const host = productionHost();
  const now = await servingDeploymentId(vercel, host);
  if (now !== serving.id) throw new Error(`production changed since the check (it serves ${now}, not ${serving.id}), so the guardian won't roll it back`);
  await rollBack(vercel, previous.id, `guardian: ${verdict.reasons.join("; ")}`.slice(0, 250));
  if (!(await servesWithin(vercel, host, previous.id))) {
    save("rollback.json", { result: "pending" });
    throw new Error(`Vercel accepted the rollback, but ${host} didn't switch to ${previous.id} within 3 minutes`);
  }
  save("rollback.json", { result: "done" });
  process.stdout.write(`guardian: ${host} serves ${previous.id} (${previous.sha.slice(0, 7)}) again\n`);
}

// On the incident's open issue, or on the revert PR when the issue is closed.
function commentOnIncident(plan: Promotion, body: string): void {
  const issue = openIncidentIssue(plan.from);
  gh(root, issue === undefined ? ["pr", "comment", plan.revert.url, "--body", body] : ["issue", "comment", issue.url, "--body", body]);
}

// After the promote, lastAliasRequest is a promote, so later runs no longer see the rollback and never promote again.
// An unconfirmed promote is reported on the incident instead of retried.
async function promoteRevert(): Promise<void> {
  const plan = load("promote.json") as Promotion | undefined;
  if (plan === undefined) throw new Error("run `evolution:guardian check` first");
  const vercel = vercelAccess();
  const host = productionHost();
  const now = await servingDeploymentId(vercel, host);
  if (now !== plan.servingId) throw new Error(`production changed since the check (it serves ${now}, not ${plan.servingId}), so the guardian won't promote`);
  await promoteDeployment(vercel, plan.target.id);
  if (!(await servesWithin(vercel, host, plan.target.id))) {
    commentOnIncident(plan, promoteUnconfirmedComment(plan.target, runUrl()));
    throw new Error(`Vercel accepted the promote, but ${host} didn't switch to ${plan.target.id} within 3 minutes`);
  }
  commentOnIncident(plan, promotedComment(plan.revert, plan.target, runUrl()));
  process.stdout.write(`guardian: ${host} serves ${plan.target.id} (${plan.target.sha.slice(0, 7)}), which has the revert #${String(plan.revert.number)}\n`);
}

function pauseFiles(dir: string): void {
  if (dir === "" || !existsSync(join(dir, CONFIG_PATH))) throw new Error("usage: pnpm evolution:guardian pause-files <pause worktree>");
  const { culprit, runUrl: run } = incident();
  const pausedPath = join(dir, PAUSED_PATH);
  const reason = `guardian: production rolled back${culprit === undefined ? "" : ` after #${String(culprit.pr.number)}`} (${run})`;
  const pause = nextPause(existsSync(pausedPath) ? readFileSync(pausedPath, "utf8") : undefined, new Date(), reason);
  if (pause !== undefined) writeFileSync(pausedPath, pause);
  const configPath = join(dir, CONFIG_PATH);
  const trust = loweredTrust(readFileSync(configPath, "utf8"));
  if (trust !== undefined) writeFileSync(configPath, trust.text);
  const changes: Changes = {
    pauseUntil: pause === undefined ? undefined : (JSON.parse(pause) as { until: string }).until,
    trust: trust === undefined ? undefined : { from: trust.from, to: trust.to },
  };
  save("changes.json", changes);
  process.stdout.write(`guardian: pause until ${changes.pauseUntil ?? "(unchanged)"}, trustLevel ${trust === undefined ? "unchanged" : `${String(trust.from)} → ${String(trust.to)}`}\n`);
}

function ensureLabel(name: string): void {
  const spec = LOOP_LABELS.find((label) => label.name === name);
  if (spec === undefined) throw new Error(`${name} isn't one of the loop's labels`);
  gh(root, labelCommand(spec));
}

// Auto-merge is pinned to the commit the guardian pushed, so nothing pushed to the branch later merges with it.
function openPr(kind: string): void {
  const found = incident();
  const culprit = found.culprit;
  if (culprit === undefined) throw new Error("there's no evolution change to revert");
  const summary = incidentSummary(found, readEvolutionConfig(root).sentry);
  let pr: { title: string; body: string; labels: string[] };
  if (kind === "revert") {
    ensureLabel(REVERT_LABEL);
    pr = { title: revertTitle(culprit.pr.title), body: revertPrBody(found, summary), labels: ["--label", REVERT_LABEL] };
  } else if (kind === "pause") {
    const changes = load("changes.json") as Changes | undefined;
    if (changes === undefined) throw new Error("run `evolution:guardian pause-files` first");
    pr = { title: pauseTitle(culprit.pr.number, changes), body: pausePrBody(found, summary, changes), labels: [] };
  } else {
    throw new Error("usage: pnpm evolution:guardian open-pr <pause|revert>");
  }
  const url = gh(root, ["pr", "create", "--base", "main", "--head", env("BRANCH"), "--title", pr.title, "--body", pr.body, ...pr.labels]);
  save(`pr-${kind}.json`, { url, autoMerge: false });
  gh(root, ["pr", "merge", url, "--auto", "--squash", "--match-head-commit", env("HEAD_SHA")]);
  save(`pr-${kind}.json`, { url, autoMerge: true });
  process.stdout.write(`guardian: opened ${url} with auto-merge on\n`);
}

function opened(kind: "pause" | "revert"): Opened | undefined {
  const pr = load(`pr-${kind}.json`) as { url: string; autoMerge: boolean } | undefined;
  if (pr === undefined || pr.autoMerge) return pr === undefined ? undefined : { url: pr.url };
  return { problem: `opened ${pr.url}, but turning auto-merge on failed; merge it once its checks pass.` };
}

function notify(): void {
  const found = incident();
  const rolled = load("rollback.json") as { result: "done" | "pending" | "skipped" } | undefined;
  const handled = load("handled.json") as Handled | undefined;
  if (handled !== undefined) {
    if (rolled?.result === "done") gh(root, [handled.kind, "comment", handled.url, "--body", retriedRollbackComment(found)]);
    process.stdout.write(`guardian: an earlier run already reported this deployment in ${handled.url}\n`);
    return;
  }
  const culprit = found.culprit;
  const changes = load("changes.json") as Changes | undefined;
  const number = culprit === undefined ? "" : `#${String(culprit.pr.number)}`;
  const skipped =
    load("prs-skipped.json") === true
      ? { problem: `a GitHub lookup failed, so the guardian couldn't tell whether an earlier run already opened its PRs and opened none; see ${found.runUrl}.` }
      : undefined;
  const revert: Outcome["revert"] =
    culprit === undefined
      ? undefined
      : (skipped ??
        opened("revert") ??
        (process.env.REVERT_CONFLICT === "true"
          ? { problem: `the revert of ${number} doesn't apply to main (later changes touch the same lines, or it was already reverted); revert it by hand.` }
          : { problem: `opening the revert of ${number} failed; see ${found.runUrl}.` }));
  const nothingToChange = changes !== undefined && changes.pauseUntil === undefined && changes.trust === undefined;
  const pause: Outcome["pause"] =
    culprit === undefined
      ? undefined
      : (skipped ?? opened("pause") ?? (nothingToChange ? "unchanged" : { problem: `opening the pause PR failed; see ${found.runUrl}.` }));
  const outcome: Outcome = { rollback: rolled?.result ?? "failed", revert, pause, changes };
  const { title, body } = notifyIssue(found, incidentSummary(found, readEvolutionConfig(root).sentry), outcome);
  ensureLabel(GUARDIAN_ISSUE_LABEL);
  process.stdout.write(`guardian: ${gh(root, ["issue", "create", "--title", title, "--body", body, "--label", GUARDIAN_ISSUE_LABEL])}\n`);
}

// Env: CHECK_OUTCOME, SPIKE and PROMOTE from the check, STEPS ("name=outcome ..." for the steps that act), STARTED_AT,
// ACT and the Supabase pair.
async function record(): Promise<void> {
  const act = process.env.ACT === "true";
  const steps = parseStepOutcomes(process.env.STEPS ?? "");
  const check = process.env.CHECK_OUTCOME ?? "";
  const status = guardianRunStatus({ check, spike: process.env.SPIKE === "true", promote: (process.env.PROMOTE ?? "") !== "", act, steps: Object.values(steps) });
  if (status === undefined) {
    process.stdout.write("guardian: a quiet run (no spike, nothing to promote), so nothing to record\n");
    return;
  }
  const found = load("incident.json") as Incident | undefined;
  const plan = load("promote.json") as Promotion | undefined;
  const runId = Number(process.env.GITHUB_RUN_ID ?? "");
  const startedAt = process.env.STARTED_AT || new Date().toISOString();
  const finishedAt = new Date();
  const { error } = await loopSupabase()
    .from("agent_runs")
    .insert({
      workflow: "guardian",
      gh_run_id: Number.isInteger(runId) && runId > 0 ? runId : null,
      gh_run_url: runUrl(),
      pr_number: found?.culprit?.pr.number ?? null,
      status,
      duration_ms: Math.max(0, finishedAt.getTime() - Date.parse(startedAt)),
      started_at: startedAt,
      finished_at: finishedAt.toISOString(),
      details: { act, check, steps, spike: [...(found?.verdict.reasons ?? [])], serving: found?.serving.id ?? null, promote: plan?.target.id ?? null },
    });
  if (error) throw new Error(`recording the run failed: ${error.message}`);
  process.stdout.write(`guardian: recorded the run (${status})\n`);
}

// Dispatches each check as its own guardian run, so each acts and reports like a scheduled one.
async function afterDeploy(): Promise<void> {
  const sha = env("SHA");
  const act = process.env.ACT === "true";
  const vercel = vercelAccess();
  const short = `\`${sha.slice(0, 7)}\``;
  const deadline = Date.now() + DEPLOY_WAIT_MS;
  let live: Deployed | undefined;
  while (live === undefined) {
    const { deployments, servingId, production } = await readProduction(vercel);
    const deploy = deployState(deployments, production, servingId, sha);
    if (deploy.kind === "live") {
      live = deploy.serving;
    } else if (deploy.kind === "stop" || Date.now() > deadline) {
      stepSummary(`## Guardian after a deploy\n\nNo checks for ${short}: ${deploy.reason}${deploy.kind === "waiting" ? ", still after 20 minutes" : ""}.`);
      return;
    } else {
      await sleep(DEPLOY_POLL_MS);
    }
  }
  const lines = ["## Guardian after a deploy", "", `${short} went live as ${live.url ?? live.id} at ${new Date(live.liveAt).toISOString()}.`, ""];
  const checks = afterDeployChecks(live.liveAt, Date.now());
  if (checks.length === 0) lines.push("- It went live too long ago: every check time has passed.");
  for (const { minutes, at } of checks) {
    await sleep(Math.max(0, at - Date.now()));
    const { production } = await readProduction(vercel);
    if (production.kind !== "ok" || production.serving.id !== live.id) {
      const now = production.kind === "held" ? production.reason : `it serves ${production.serving.id}`;
      lines.push(`- ${String(minutes)} min: production no longer serves it (${now}), so the checks stop.`);
      break;
    }
    gh(root, ["workflow", "run", "evolution-guardian.yml", "--ref", "main", "-f", `act=${String(act)}`]);
    const line = `- ${String(minutes)} min: dispatched evolution-guardian${act ? " with act" : " (a dry run)"}.`;
    lines.push(line);
    process.stdout.write(`guardian: ${line.slice(2)}\n`);
  }
  stepSummary(lines.join("\n"));
}

const command = process.argv[2];
if (command === "check") await check();
else if (command === "promote") await promoteRevert();
else if (command === "rollback") await rollback();
else if (command === "pause-files") pauseFiles(process.argv[3] ?? "");
else if (command === "open-pr") openPr(process.argv[3] ?? "");
else if (command === "notify") notify();
else if (command === "record") await record();
else if (command === "after-deploy") await afterDeploy();
else throw new Error("usage: pnpm evolution:guardian <check|promote|rollback|pause-files <dir>|open-pr <pause|revert>|notify|record|after-deploy>");
