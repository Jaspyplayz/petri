// Limits every workflow must keep (Phase 8): read-only permissions at the top so write access is granted per job, a
// timeout on every job, and on every claude-code-action step a pinned commit, a --max-turns and the secret scrub
// (CLAUDE_CODE_SUBPROCESS_ENV_SCRUB, which keeps tokens out of the agent's subprocesses), after a run step in the same
// job that installs bubblewrap and allows user namespaces (the scrub needs both, or the CLI won't even install). A run
// step that gets the Claude token, such as the evals runner's, comes after that step too. A run step never names a
// secret inline or prints the environment. A schedule runs at most every 15 minutes. The test runs these on every file
// in .github/workflows, so a new or edited workflow can't drop them.
import { load } from "js-yaml";

const MAX_TIMEOUT_MINUTES = 240;
const MIN_CRON_GAP_MINUTES = 15;
const SECRET_IN_RUN = /\$\{\{\s*secrets\./;
const PRINTS_ENV = [
  /\bprintenv\b/,
  /(^|[;&|(])\s*(env|set|export\s+-p|declare\s+-x)\s*($|[;&|)>])/m,
  /\bset\s+(-[a-z]*x|-o\s+xtrace)/,
  /\bbash\s+-[a-z]*x\b/,
];
const INSTALLS_SANDBOX = [/apt-get install[^\n]*\bbubblewrap\b/, /apparmor_restrict_unprivileged_userns=0/];
const CLAUDE_CREDENTIALS = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];

type Json = Record<string, unknown>;

function record(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : undefined;
}

export function cronProblem(cron: string): string | undefined {
  const minute = cron.trim().split(/\s+/)[0] ?? "";
  const every = /^\*\/(\d+)$/.exec(minute);
  if (every) return Number(every[1]) >= MIN_CRON_GAP_MINUTES ? undefined : `"${cron}" runs every ${every[1] ?? "?"} minutes`;
  if (!/^\d+(,\d+)*$/.test(minute)) return `"${cron}" has a minute field that isn't a number, a list or */N`;
  const minutes = minute.split(",").map(Number).sort((a, b) => a - b);
  const gaps = minutes.map((m, i) => ((minutes[i + 1] ?? (minutes[0] ?? 0) + 60) - m));
  return minutes.length > 1 && Math.min(...gaps) < MIN_CRON_GAP_MINUTES ? `"${cron}" runs less than ${String(MIN_CRON_GAP_MINUTES)} minutes apart` : undefined;
}

export function workflowLimitProblems(file: string, text: string): string[] {
  const doc = record(load(text));
  if (!doc) return [`${file}: not a YAML mapping`];
  const problems: string[] = [];
  const top = doc.permissions;
  const topPermissions = record(top);
  if (!topPermissions && top !== "read-all" && top !== "{}") {
    problems.push(`${file}: no top-level permissions; set "permissions: contents: read" and grant writes per job`);
  }
  for (const [scope, level] of Object.entries(topPermissions ?? {})) {
    if (level === "write") problems.push(`${file}: top-level permissions give ${scope}: write to every job; grant it in the job that needs it`);
  }
  const on = record(doc.on) ?? record(doc.true);
  const schedule = Array.isArray(on?.schedule) ? on.schedule : [];
  for (const entry of schedule) {
    const cron = record(entry)?.cron;
    const problem = typeof cron === "string" ? cronProblem(cron) : "a schedule entry has no cron";
    if (problem) problems.push(`${file}: ${problem}`);
  }
  for (const [name, rawJob] of Object.entries(record(doc.jobs) ?? {})) {
    const job = record(rawJob) ?? {};
    if (typeof job.uses === "string") continue;
    const timeout = job["timeout-minutes"];
    if (typeof timeout !== "number" || timeout <= 0 || timeout > MAX_TIMEOUT_MINUTES) {
      problems.push(`${file}: job ${name} needs timeout-minutes between 1 and ${String(MAX_TIMEOUT_MINUTES)}`);
    }
    const steps = Array.isArray(job.steps) ? job.steps : [];
    let sandboxed = false;
    for (const rawStep of steps) {
      const step = record(rawStep) ?? {};
      const script = step.run;
      if (typeof script === "string") {
        const label = typeof step.name === "string" ? step.name : "a run step";
        if (SECRET_IN_RUN.test(script)) problems.push(`${file}: job ${name}, "${label}" puts a secret in the script; pass it through env:`);
        if (PRINTS_ENV.some((pattern) => pattern.test(script))) problems.push(`${file}: job ${name}, "${label}" prints the environment`);
        if (INSTALLS_SANDBOX.every((pattern) => pattern.test(script))) sandboxed = true;
        if (!sandboxed && CLAUDE_CREDENTIALS.some((key) => key in (record(step.env) ?? {}))) {
          problems.push(`${file}: job ${name}, "${label}" gets the Claude token before a step that installs bubblewrap and allows user namespaces`);
        }
      }
      const uses = typeof step.uses === "string" ? step.uses : "";
      if (!uses.startsWith("anthropics/claude-code-action")) continue;
      if (String(record(step.env)?.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB) !== "1") {
        problems.push(`${file}: job ${name} runs claude-code-action without env CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"`);
      }
      if (!sandboxed) problems.push(`${file}: job ${name} runs claude-code-action before a step that installs bubblewrap and allows user namespaces`);
      if (!/@[0-9a-f]{40}$/.test(uses)) problems.push(`${file}: job ${name} uses ${uses}; pin claude-code-action to a commit SHA`);
      const args = record(step.with)?.claude_args;
      if (typeof args !== "string" || !/--max-turns\s+\S/.test(args)) {
        problems.push(`${file}: job ${name} runs claude-code-action without --max-turns in claude_args`);
      }
    }
  }
  return problems;
}
