import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadGuardrailsConfig } from "./check-pr/config";
import { gh } from "./evolution/github-issue";
import { GUARDIAN_ISSUE_LABEL, incidentMarker, parseRevertBranch } from "./evolution/guardian";
import { deploymentSha, sentryErrorGroups } from "./evolution/guardian-api";
import {
  errorGroups,
  incidentDeploymentId,
  POSTMORTEM_BRANCH_PREFIX,
  POSTMORTEM_LABEL,
  postmortemBranch,
  postmortemPrBody,
  postmortemReportSchema,
  postmortemTitle,
  renderEvidence,
  reportProblems,
  type ErrorGroup,
  type Evidence,
  type PostmortemReport,
} from "./evolution/postmortem";
import { defang } from "./evolution/triage-output";
import { labelCommand, LOOP_LABELS } from "./setup-labels/labels";
import { NEEDS_HUMAN_LABEL } from "./trust-report/ladder";

// pnpm evolution:postmortem <command> runs in evolution-postmortem.yml:
// gather: in a trusted job, collect the evidence for PR's postmortem (the PR, its diff and issue, the guardian's
//   revert REVERT and incident issue, and the incident release's errors from Vercel and Sentry) into
//   artifacts/postmortem/. Outputs found, branch, base and incident. found is false when PR already has an open
//   postmortem PR.
// check-report <report.json>: fail unless the agent's report matches the schema and its outcome. Outputs outcome.
// labels: create the labels open-pr puts on the PR.
// open-pr: open the PR for the pushed BRANCH from the report and the evidence, labelled postmortem, and needs-human
//   when it changes PROTECTED paths. GH_TOKEN must be EVOLUTION_BOT_TOKEN so CI runs on the PR. Outputs url.
const root = join(import.meta.dirname, "..");
const dir = join(root, "artifacts", "postmortem");
const SENTRY_DAYS = 14;

type ViewedPr = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly headRefName: string;
  readonly mergedAt: string | null;
  readonly mergeCommit: { readonly oid: string } | null;
  readonly files: readonly { readonly path: string }[];
  readonly labels: readonly { readonly name: string }[];
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set`);
  return value;
}

function positive(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a PR number, not ${value}`);
  return number;
}

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`);
  if (file) appendFileSync(file, lines.join(""));
  process.stdout.write(lines.map((line) => `postmortem: ${line}`).join(""));
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function attempt<T>(what: string, problems: string[], run: () => T | Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    problems.push(`${what}: ${errorText(error)}`);
    return undefined;
  }
}

type Listed = { readonly number: number; readonly url: string; readonly body: string };
type OpenPr = { readonly url: string; readonly headRefName: string };
type ViewedIssue = { readonly number: number; readonly title: string; readonly body: string };

function json(args: readonly string[]): unknown {
  return JSON.parse(gh(root, args));
}

async function gather(): Promise<void> {
  const number = positive(env("PR"), "PR") ?? 0;
  const revertNumber = positive(process.env.REVERT, "REVERT");
  const note = (process.env.NOTE ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const fields = "number,title,body,url,headRefName,mergedAt,mergeCommit,files,labels";
  const pr = json(["pr", "view", String(number), "--json", fields]) as ViewedPr;
  const config = loadGuardrailsConfig(root);
  if (!pr.headRefName.startsWith("evo/") && !pr.labels.some((label) => config.agentPullRequests.labels.includes(label.name))) {
    throw new Error(`#${String(number)} isn't an evolution PR; a postmortem is for an agent's change`);
  }
  const open = json(["pr", "list", "--state", "open", "--limit", "100", "--json", "url,headRefName"]) as OpenPr[];
  const existing = open.find((item) => item.headRefName.startsWith(`${POSTMORTEM_BRANCH_PREFIX}${String(number)}-`));
  if (existing !== undefined) {
    output({ found: "false" });
    process.stdout.write(`postmortem: #${String(number)} already has an open postmortem PR: ${existing.url}\n`);
    return;
  }

  const problems: string[] = [];
  const diff = (await attempt("reading the PR's diff", problems, () => gh(root, ["pr", "diff", String(number)]))) ?? "";
  const issueNumber = /^evo\/(\d+)-/.exec(pr.headRefName)?.[1];
  const issue =
    issueNumber === undefined
      ? undefined
      : await attempt(`reading the issue #${issueNumber}`, problems, () => json(["issue", "view", issueNumber, "--json", "number,title,body"]) as ViewedIssue);
  const revert =
    revertNumber === undefined
      ? undefined
      : await attempt(`reading the revert #${String(revertNumber)}`, problems, () => {
          const viewed = json(["pr", "view", String(revertNumber), "--json", "number,url,body,headRefName"]) as Listed & OpenPr;
          if (parseRevertBranch(viewed.headRefName)?.pr !== number) throw new Error(`${viewed.headRefName} isn't the guardian's revert of #${String(number)}`);
          return viewed;
        });
  const deploymentId = revert === undefined ? undefined : incidentDeploymentId(revert.body);
  if (revert !== undefined && deploymentId === undefined) problems.push(`the revert #${String(revert.number)} has no incident marker`);
  const incident =
    deploymentId === undefined
      ? undefined
      : await attempt("finding the guardian's incident issue", problems, () => {
          const issues = json(["issue", "list", "--state", "all", "--label", GUARDIAN_ISSUE_LABEL, "--limit", "50", "--json", "number,url,body"]) as Listed[];
          const found = issues.find((item) => item.body.includes(incidentMarker(deploymentId)));
          if (found === undefined) throw new Error(`no ${GUARDIAN_ISSUE_LABEL} issue has the marker for ${deploymentId}`);
          return found;
        });
  const release =
    deploymentId === undefined
      ? undefined
      : await attempt(`reading the deployment ${deploymentId}`, problems, () =>
          deploymentSha({ token: env("VERCEL_TOKEN"), projectId: env("VERCEL_PROJECT_ID"), teamId: env("VERCEL_ORG_ID") }, deploymentId),
        );
  let errors: ErrorGroup[] = [];
  if (release !== undefined) {
    const now = new Date();
    const window = { start: new Date(now.getTime() - SENTRY_DAYS * 86_400_000), end: now };
    const sentry = () => ({ token: env("SENTRY_AUTH_TOKEN"), org: env("SENTRY_ORG"), project: env("SENTRY_PROJECT") });
    errors = errorGroups((await attempt("reading the release's errors from Sentry", problems, () => sentryErrorGroups(sentry(), release, window))) ?? []);
  }

  const evidence: Evidence = {
    pr: {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      body: pr.body,
      headRefName: pr.headRefName,
      mergedAt: pr.mergedAt,
      mergeCommit: pr.mergeCommit?.oid,
      files: pr.files.map((file) => file.path),
    },
    issue,
    revert: revert === undefined ? undefined : { number: revert.number, url: revert.url },
    incident,
    release,
    errors,
    note,
    problems,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(join(dir, "evidence.md"), renderEvidence(evidence, diff));
  const base = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error("couldn't read the base commit");
  output({ found: "true", branch: postmortemBranch(number, base), base, incident: incident === undefined ? "" : String(incident.number) });
  for (const problem of problems) process.stdout.write(`postmortem: lookup failed: ${problem}\n`);
}

function readReport(file: string): PostmortemReport {
  const parsed = postmortemReportSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`the postmortem report doesn't match the schema: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function checkReport(file: string | undefined): void {
  if (file === undefined) throw new Error("usage: pnpm evolution:postmortem check-report <report.json>");
  const report = readReport(file);
  const problems = reportProblems(report);
  if (problems.length > 0) throw new Error(`the postmortem report doesn't add up: ${problems.join("; ")}`);
  output({ outcome: report.outcome, reason: defang(report.blockedReason ?? "").replace(/\s+/g, " ") });
}

function labels(): void {
  for (const name of [POSTMORTEM_LABEL, NEEDS_HUMAN_LABEL]) {
    const spec = LOOP_LABELS.find((label) => label.name === name);
    if (spec === undefined) throw new Error(`${name} isn't one of the loop's labels`);
    gh(root, labelCommand(spec));
  }
}

function openPr(): void {
  const branch = env("BRANCH");
  if (!/^postmortem\/\d+-[0-9a-f]{7}$/.test(branch)) throw new Error(`${branch} isn't a postmortem branch`);
  const report = readReport(join(dir, "report.json"));
  const evidence = JSON.parse(readFileSync(join(dir, "evidence.json"), "utf8")) as Evidence;
  const protectedPaths = (process.env.PROTECTED ?? "").split(/\s+/).filter((path) => path !== "");
  const body = postmortemPrBody({ report, evidence, protectedPaths, runUrl: env("RUN_URL") });
  const bodyFile = join(dir, "pr-body.md");
  writeFileSync(bodyFile, body);
  const labelNames = [POSTMORTEM_LABEL, ...(protectedPaths.length > 0 ? [NEEDS_HUMAN_LABEL] : [])].join(",");
  const url = gh(root, ["pr", "create", "--base", "main", "--head", branch, "--title", postmortemTitle(report), "--body-file", bodyFile, "--label", labelNames]);
  output({ url });
}

const command = process.argv[2];
if (command === "gather") await gather();
else if (command === "check-report") checkReport(process.argv[3]);
else if (command === "labels") labels();
else if (command === "open-pr") openPr();
else throw new Error("usage: pnpm evolution:postmortem <gather|check-report <report.json>|labels|open-pr>");
