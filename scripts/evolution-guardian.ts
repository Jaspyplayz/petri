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
  checkWindows,
  culpritCommit,
  GUARDIAN_BRANCH_PREFIX,
  GUARDIAN_ISSUE_LABEL,
  incidentMarker,
  loweredTrust,
  nextPause,
  pauseBranch,
  productionState,
  revertBranch,
  spikeVerdict,
  type AliasRequest,
  type MainCommit,
  type VercelDeployment,
} from "./evolution/guardian";
import { lastAliasRequest, productionDeployments, rollBack, sentryNumbers, servingDeploymentId, type SentryAccess, type VercelAccess } from "./evolution/guardian-api";
import {
  incidentSummary,
  notifyIssue,
  pausePrBody,
  pauseTitle,
  retriedRollbackComment,
  revertPrBody,
  revertTitle,
  type Changes,
  type Incident,
  type Opened,
  type Outcome,
} from "./evolution/guardian-report";
import { mergedPrNumber, type CommitPr } from "./evolution/post-merge";
import { labelCommand, LOOP_LABELS } from "./setup-labels/labels";
import { REVERT_LABEL } from "./trust-report/ladder";

// pnpm evolution:guardian <command> runs from main in evolution-guardian.yml, one step per command:
// check: compare the release production serves with the one before it in Sentry, and find the evolution merge that
//   went live with it. Writes the state for the later steps and the spike, handled, culprit and branch outputs.
//   Changes nothing.
// rollback: point production back at the previous deployment and wait until the production URL serves it.
// pause-files <dir>: in the pause worktree, extend .evolution/PAUSED and lower trustLevel, as guardrails allow agents to.
// open-pr <pause|revert>: open that PR from the pushed branch and turn auto-merge on for the pushed commit.
// notify: open the issue that tells the maintainer what happened and what's left to do.
const root = join(import.meta.dirname, "..");
const state = join(process.env.RUNNER_TEMP ?? tmpdir(), "guardian");
const ROLLBACK_WAIT_MS = 3 * 60_000;
const POLL_MS = 10_000;
// Commits that went live with one deployment; a longer gap between deployments isn't searched for its change.
const MAX_COMMITS = 20;

type Handled = { readonly url: string; readonly kind: "issue" | "pr" };

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

// The guardian's open issue or PR for this deployment, when an earlier run already acted on it. Then only the
// rollback is retried: the PRs and the issue exist.
function handledBy(servingId: string): Handled | undefined {
  const marker = incidentMarker(servingId);
  const issues = JSON.parse(gh(root, ["issue", "list", "--state", "open", "--label", GUARDIAN_ISSUE_LABEL, "--limit", "50", "--json", "url,body"])) as { url: string; body: string }[];
  const issue = issues.find((item) => item.body.includes(marker));
  if (issue !== undefined) return { url: issue.url, kind: "issue" };
  const prs = JSON.parse(gh(root, ["pr", "list", "--state", "open", "--base", "main", "--limit", "100", "--json", "url,body,headRefName"])) as {
    url: string;
    body: string;
    headRefName: string;
  }[];
  const pr = prs.find((item) => item.headRefName.startsWith(GUARDIAN_BRANCH_PREFIX) && item.body.includes(marker));
  return pr === undefined ? undefined : { url: pr.url, kind: "pr" };
}

// What Vercel answered, so a dry run shows the fields the guardian relies on.
function vercelLine(deployments: readonly VercelDeployment[], aliasRequest: AliasRequest | undefined): string {
  const ready = deployments.filter((deployment) => deployment.state === "READY" && deployment.target === "production");
  const served = ready.filter((deployment) => deployment.readySubstate === "PROMOTED").length;
  const last = aliasRequest === undefined ? "none" : `${aliasRequest.type} to ${aliasRequest.toDeploymentId} at ${new Date(aliasRequest.requestedAt).toISOString()}`;
  return `- **Vercel:** ${String(ready.length)} ready production deployments listed, ${String(served)} of them have served production; last promote or rollback: ${last}`;
}

async function check(): Promise<void> {
  const config = readEvolutionConfig(root);
  const vercel = vercelAccess();
  const [deployments, servingId, aliasRequest] = await Promise.all([
    productionDeployments(vercel),
    servingDeploymentId(vercel, productionHost()),
    lastAliasRequest(vercel),
  ]);
  const production = productionState(deployments, servingId, aliasRequest);
  if (production.kind === "held") {
    output({ spike: "false" });
    stepSummary(`## Guardian\n\nNot checking: ${production.reason}.\n\n${vercelLine(deployments, aliasRequest)}`);
    return;
  }
  const { serving, previous } = production;
  const now = new Date();
  const windows = checkWindows(serving.liveAt, previous?.liveAt, now, config.sentry.windowMinutes);
  const numbers = await sentryNumbers(sentryAccess(), { serving: serving.sha, previous: previous?.sha, ...windows });
  const verdict = spikeVerdict(numbers, config.sentry);
  const found = culpritCommit(liveCommits(serving.sha, previous?.sha));
  const handled = verdict.spike ? handledBy(serving.id) : undefined;
  if (handled !== undefined) save("handled.json", handled);
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? "local"}/actions/runs/${process.env.GITHUB_RUN_ID ?? "0"}`;
  const result: Incident = {
    checkedAt: now.toISOString(),
    serving,
    previous,
    currentWindow: { start: windows.current.start.toISOString(), end: windows.current.end.toISOString() },
    numbers,
    verdict,
    culprit: found === undefined ? undefined : { sha: found.sha, pr: { number: found.pr.number, title: found.pr.title, url: found.pr.url } },
    runUrl,
  };
  save("incident.json", result);
  output({
    spike: String(verdict.spike),
    handled: handled?.url ?? "",
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
  const deadline = Date.now() + ROLLBACK_WAIT_MS;
  while ((await servingDeploymentId(vercel, host)) !== previous.id) {
    if (Date.now() > deadline) throw new Error(`Vercel accepted the rollback, but ${host} didn't switch to ${previous.id} within 3 minutes`);
    await sleep(POLL_MS);
  }
  save("rollback.json", { result: "done" });
  process.stdout.write(`guardian: ${host} serves ${previous.id} (${previous.sha.slice(0, 7)}) again\n`);
}

function pauseFiles(dir: string): void {
  if (dir === "" || !existsSync(join(dir, CONFIG_PATH))) throw new Error("usage: pnpm evolution:guardian pause-files <pause worktree>");
  const { culprit, runUrl } = incident();
  const pausedPath = join(dir, PAUSED_PATH);
  const reason = `guardian: production rolled back${culprit === undefined ? "" : ` after #${String(culprit.pr.number)}`} (${runUrl})`;
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
    pr = { title: pauseTitle(culprit.pr.number), body: pausePrBody(found, summary, changes), labels: [] };
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
  const rolled = load("rollback.json") as { result: "done" | "skipped" } | undefined;
  const handled = load("handled.json") as Handled | undefined;
  if (handled !== undefined) {
    if (rolled?.result === "done" && handled.kind === "issue") gh(root, ["issue", "comment", handled.url, "--body", retriedRollbackComment(found)]);
    process.stdout.write(`guardian: an earlier run already reported this deployment in ${handled.url}\n`);
    return;
  }
  const culprit = found.culprit;
  const changes = load("changes.json") as Changes | undefined;
  const number = culprit === undefined ? "" : `#${String(culprit.pr.number)}`;
  const revert: Outcome["revert"] =
    culprit === undefined
      ? undefined
      : (opened("revert") ??
        (process.env.REVERT_CONFLICT === "true"
          ? { problem: `the revert of ${number} doesn't apply cleanly to main (later changes touch the same lines); revert it by hand.` }
          : { problem: `opening the revert of ${number} failed; see ${found.runUrl}.` }));
  const nothingToChange = changes !== undefined && changes.pauseUntil === undefined && changes.trust === undefined;
  const pause: Outcome["pause"] =
    culprit === undefined ? undefined : (opened("pause") ?? (nothingToChange ? "unchanged" : { problem: `opening the pause PR failed; see ${found.runUrl}.` }));
  const outcome: Outcome = { rollback: rolled?.result ?? "failed", revert, pause, changes };
  const { title, body } = notifyIssue(found, incidentSummary(found, readEvolutionConfig(root).sentry), outcome);
  ensureLabel(GUARDIAN_ISSUE_LABEL);
  process.stdout.write(`guardian: ${gh(root, ["issue", "create", "--title", title, "--body", body, "--label", GUARDIAN_ISSUE_LABEL])}\n`);
}

const command = process.argv[2];
if (command === "check") await check();
else if (command === "rollback") await rollback();
else if (command === "pause-files") pauseFiles(process.argv[3] ?? "");
else if (command === "open-pr") openPr(process.argv[3] ?? "");
else if (command === "notify") notify();
else throw new Error("usage: pnpm evolution:guardian <check|rollback|pause-files <dir>|open-pr <pause|revert>|notify>");
