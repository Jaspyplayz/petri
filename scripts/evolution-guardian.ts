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
  GUARDIAN_ISSUE_LABEL,
  loweredTrust,
  nextPause,
  productionState,
  revertBranch,
  spikeVerdict,
  type MainCommit,
} from "./evolution/guardian";
import { productionDeployments, rollBack, sentryNumbers, servingDeploymentId, type SentryAccess, type VercelAccess } from "./evolution/guardian-api";
import { incidentSummary, notifyIssue, revertPrBody, revertTitle, type Incident, type Outcome } from "./evolution/guardian-report";
import { mergedPrNumber, type CommitPr } from "./evolution/post-merge";
import { labelCommand, LOOP_LABELS } from "./setup-labels/labels";
import { REVERT_LABEL } from "./trust-report/ladder";

// pnpm evolution:guardian <command> runs from main in evolution-guardian.yml, one step per command:
// check: compare the release production serves with the one before it in Sentry, and find the evolution merge that
//   went live with it. Writes the state for the later steps and the spike, previous and branch outputs. Changes nothing.
// rollback: point production back at the previous deployment and wait until the production URL serves it.
// pause-files <dir>: in the revert worktree, extend .evolution/PAUSED and lower trustLevel, as guardrails allow agents to.
// open-pr: open the revert PR from the pushed branch and turn auto-merge on.
// notify: open the issue that tells the maintainer what happened and what's left to do.
const root = join(import.meta.dirname, "..");
const state = join(process.env.RUNNER_TEMP ?? tmpdir(), "guardian");
const ROLLBACK_WAIT_MS = 3 * 60_000;
const POLL_MS = 10_000;
// Commits that went live with one deployment; a longer gap between deployments isn't searched for its change.
const MAX_COMMITS = 20;

type Changes = Pick<Outcome, "pauseUntil" | "trust">;

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
function liveCommits(serving: string, previous: string | undefined): MainCommit[] {
  const range = previous === undefined ? undefined : git(["rev-list", "--first-parent", `--max-count=${String(MAX_COMMITS)}`, `${previous}..${serving}`]);
  const shas = range === undefined || range === "" ? [serving] : range.split(/\r?\n/);
  const guardrails = loadGuardrailsConfig(root);
  return shas.map((sha) => {
    const number = mergedPrNumber(JSON.parse(gh(root, ["api", `repos/{owner}/{repo}/commits/${sha}/pulls`])) as CommitPr[], sha);
    if (number === undefined) return { sha, pr: undefined };
    const pr = JSON.parse(gh(root, ["pr", "view", String(number), "--json", `${PR_FIELDS},url`])) as GhPr & { readonly url: string };
    return { sha, pr: { number, title: pr.title, url: pr.url, evolution: isEvolutionPr(pr, guardrails) } };
  });
}

async function check(): Promise<void> {
  const config = readEvolutionConfig(root);
  const vercel = vercelAccess();
  const [deployments, servingId] = await Promise.all([productionDeployments(vercel), servingDeploymentId(vercel, productionHost())]);
  const production = productionState(deployments, servingId);
  if (production.kind === "held") {
    output({ spike: "false" });
    stepSummary(`## Guardian\n\nNot checking: ${production.reason}.`);
    return;
  }
  const { serving, previous } = production;
  const now = new Date();
  const windows = checkWindows(serving.liveAt, now, config.sentry.windowMinutes);
  const numbers = await sentryNumbers(sentryAccess(), { serving: serving.sha, previous: previous?.sha, ...windows });
  const verdict = spikeVerdict(numbers, config.sentry);
  const found = culpritCommit(liveCommits(serving.sha, previous?.sha));
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
    previous: previous?.id ?? "",
    culprit: found?.sha ?? "",
    branch: found === undefined ? "" : revertBranch(found.pr.number, found.sha),
  });
  const act = process.env.ACT === "true";
  const plan = !verdict.spike
    ? ""
    : act
      ? "\n\nActing on it: rollback, revert PR, notify."
      : `\n\n**Dry run:** acting would roll production back to ${previous?.id ?? "nothing (no previous deployment)"}${found === undefined ? "" : `, revert #${String(found.pr.number)}`} and open an issue.`;
  stepSummary(`## Guardian\n\n${incidentSummary(result, config.sentry)}${plan}`);
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
  if (dir === "" || !existsSync(join(dir, CONFIG_PATH))) throw new Error("usage: pnpm evolution:guardian pause-files <revert worktree>");
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

function openPr(): void {
  const found = incident();
  const changes = (load("changes.json") as Changes | undefined) ?? { pauseUntil: undefined, trust: undefined };
  if (found.culprit === undefined) throw new Error("there's no evolution change to revert");
  const summary = incidentSummary(found, readEvolutionConfig(root).sentry);
  ensureLabel(REVERT_LABEL);
  const url = gh(root, [
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    env("BRANCH"),
    "--title",
    revertTitle(found.culprit.pr.title),
    "--body",
    revertPrBody(found, summary, changes),
    "--label",
    REVERT_LABEL,
  ]);
  save("pr.json", { url });
  gh(root, ["pr", "merge", url, "--auto", "--squash"]);
  process.stdout.write(`guardian: opened ${url} with auto-merge on\n`);
}

function notify(): void {
  const found = incident();
  const changes = load("changes.json") as Changes | undefined;
  const pr = load("pr.json") as { url: string } | undefined;
  const rolled = load("rollback.json") as { result: "done" | "skipped" } | undefined;
  const revert: Outcome["revert"] =
    found.culprit === undefined
      ? undefined
      : pr !== undefined
        ? { url: pr.url }
        : process.env.REVERT_CONFLICT === "true"
          ? { problem: `the revert of #${String(found.culprit.pr.number)} doesn't apply cleanly to main (later changes touch the same lines); revert it by hand.` }
          : { problem: `opening the revert of #${String(found.culprit.pr.number)} failed; see ${found.runUrl}.` };
  const outcome: Outcome = { rollback: rolled?.result ?? "failed", revert, pauseUntil: changes?.pauseUntil, trust: changes?.trust };
  const { title, body } = notifyIssue(found, incidentSummary(found, readEvolutionConfig(root).sentry), outcome);
  ensureLabel(GUARDIAN_ISSUE_LABEL);
  process.stdout.write(`guardian: ${gh(root, ["issue", "create", "--title", title, "--body", body, "--label", GUARDIAN_ISSUE_LABEL])}\n`);
}

const command = process.argv[2];
if (command === "check") await check();
else if (command === "rollback") await rollback();
else if (command === "pause-files") pauseFiles(process.argv[3] ?? "");
else if (command === "open-pr") openPr();
else if (command === "notify") notify();
else throw new Error("usage: pnpm evolution:guardian <check|rollback|pause-files <dir>|open-pr|notify>");
