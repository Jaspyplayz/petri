// pnpm evals [skill ...] [--max N] [--subject-model M] [--judge-model M] [--keep]
//
// For each case in evals/<skill>/cases/: copy the repo at HEAD (no history, no evals/) into a temp folder with a
// neutral name, run the case's setup.sh there, run `claude -p` on task.md with the project's skills and settings, then
// ask a judge in a fresh context to score the transcript, the diff and the verify screenshots against rubric.md.
// One line per case goes to evals/results.jsonl; the full run is kept under artifacts/evals/<run id>/.
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_JUDGE_MODEL, JUDGE_SCHEMA, SUBJECT_ALLOWED_TOOLS, SUBJECT_MAX_TURNS, judgePrompt, type JudgeVerdict } from "./evals/agents";
import { caseProblems, selectCases, type EvalCase } from "./evals/cases";
import type { EvalResult } from "./evals/results";
import { bashCommands, condenseTranscript, ranVerify } from "./evals/transcript";
import { readEvolutionConfig } from "./evolution/config";

const root = join(import.meta.dirname, "..");
const evalsDir = join(root, "evals");
const SUBJECT_TIMEOUT_MS = 45 * 60_000;
const JUDGE_TIMEOUT_MS = 15 * 60_000;
const BASH = process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe") : "bash";

function run(command: string, args: readonly string[], options: SpawnSyncOptions & { cwd: string }): string {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} exited ${String(result.status)}: ${String(result.stderr).slice(-2000)}`);
  }
  return String(result.stdout);
}

function discoverCases(): EvalCase[] {
  if (!existsSync(evalsDir)) return [];
  const cases: EvalCase[] = [];
  const problems: string[] = [];
  for (const skill of readdirSync(evalsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const casesDir = join(evalsDir, skill.name, "cases");
    if (!existsSync(casesDir)) continue;
    for (const id of readdirSync(casesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = join(casesDir, id.name);
      problems.push(...caseProblems(skill.name, id.name, readdirSync(dir)));
      cases.push({ skill: skill.name, id: id.name, dir });
    }
  }
  if (problems.length > 0) throw new Error(`broken eval cases:\n${problems.join("\n")}`);
  return cases;
}

// A copy of HEAD's files without evals/ (the rubrics) and without history or branch names, committed as one plain
// commit that origin/main also points at, so verify:compare origin/main works. Then the case's setup.sh, committed.
function prepareCopy(evalCase: EvalCase): string {
  const work = mkdtempSync(join(tmpdir(), "petri-work-"));
  const repo = join(work, "petri");
  mkdirSync(repo);
  const git = (...args: string[]) => run("git", ["-c", "user.name=Petri", "-c", "user.email=petri@users.noreply.github.com", ...args], { cwd: repo });
  git("init", "-q", "-b", "main");
  git("fetch", "-q", "--depth=1", root, "HEAD");
  git("read-tree", "FETCH_HEAD");
  git("rm", "-r", "-q", "--cached", "--ignore-unmatch", "evals");
  git("checkout-index", "-a");
  rmSync(join(repo, ".git", "FETCH_HEAD"), { force: true });
  git("commit", "-q", "-m", "Initial commit");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], { cwd: repo, shell: process.platform === "win32" });
  run("pnpm", ["-s", "env:local"], { cwd: repo, shell: process.platform === "win32" });
  run(BASH, [join(evalCase.dir, "setup.sh")], { cwd: repo });
  if (git("status", "--porcelain").trim()) {
    git("add", "-A");
    git("commit", "-q", "-m", "Work in progress");
  }
  return repo;
}

function claude(args: readonly string[], cwd: string, timeout: number): string {
  // The agent under test runs with the normal guardrails: EVOLUTION_HUMAN is a human's switch, never an agent's.
  return run("claude", args, { cwd, timeout, env: { ...process.env, EVOLUTION_HUMAN: "" } });
}

function lastJson(text: string): { total_cost_usd?: number; structured_output?: unknown } {
  const line = text.trim().split("\n").reverse().find((l) => l.startsWith("{") && l.includes('"type":"result"'));
  return line ? (JSON.parse(line) as { total_cost_usd?: number; structured_output?: unknown }) : {};
}

function runCase(evalCase: EvalCase, options: { runId: string; commit: string; subjectModel: string; judgeModel: string; keep: boolean }): EvalResult {
  const started = Date.now();
  const out = join(root, "artifacts", "evals", options.runId, `${evalCase.skill}__${evalCase.id}`);
  mkdirSync(out, { recursive: true });
  const task = readFileSync(join(evalCase.dir, "task.md"), "utf8");
  const rubric = readFileSync(join(evalCase.dir, "rubric.md"), "utf8");
  const repo = prepareCopy(evalCase);
  process.stdout.write(`evals: ${evalCase.skill}/${evalCase.id} in ${repo}\n`);

  let transcript = "";
  try {
    transcript = claude(
      ["-p", task, "--model", options.subjectModel, "--max-turns", String(SUBJECT_MAX_TURNS), "--output-format", "stream-json", "--verbose",
        "--setting-sources", "project", "--allowedTools", SUBJECT_ALLOWED_TOOLS, "--disallowedTools", "WebFetch,WebSearch"],
      repo,
      SUBJECT_TIMEOUT_MS,
    );
  } catch (error) {
    transcript += `\n${JSON.stringify({ type: "runner_error", message: String(error) })}`;
  }
  const lines = transcript.split("\n");
  const commands = bashCommands(lines);
  run("git", ["add", "-A"], { cwd: repo });
  writeFileSync(join(out, "transcript.jsonl"), transcript);
  writeFileSync(join(out, "transcript.md"), condenseTranscript(lines));
  writeFileSync(join(out, "commands.txt"), `${commands.join("\n")}\n`);
  writeFileSync(join(out, "diff.patch"), run("git", ["diff", "--cached", "HEAD"], { cwd: repo }));
  if (existsSync(join(repo, "artifacts", "verify"))) cpSync(join(repo, "artifacts", "verify"), join(out, "verify"), { recursive: true });
  if (!options.keep) rmSync(join(repo, ".."), { recursive: true, force: true });

  const judged = lastJson(
    claude(
      ["-p", judgePrompt(task, rubric, ranVerify(commands)), "--model", options.judgeModel, "--max-turns", "40", "--output-format", "json",
        "--setting-sources", "project", "--tools", "Read,Glob,Grep", "--allowedTools", "Read,Glob,Grep", "--json-schema", JSON.stringify(JUDGE_SCHEMA)],
      out,
      JUDGE_TIMEOUT_MS,
    ),
  );
  const verdict = (judged.structured_output ?? { score: 1, passed: false, summary: "The judge returned no verdict." }) as JudgeVerdict;
  writeFileSync(join(out, "judge.json"), `${JSON.stringify(verdict, null, 2)}\n`);
  const subjectCost = lastJson(transcript).total_cost_usd ?? 0;
  return {
    date: new Date().toISOString(),
    runId: options.runId,
    skill: evalCase.skill,
    case: evalCase.id,
    subjectModel: options.subjectModel,
    judgeModel: options.judgeModel,
    score: verdict.score,
    passed: verdict.passed,
    ranVerify: ranVerify(commands),
    costUsd: Math.round((subjectCost + (judged.total_cost_usd ?? 0)) * 100) / 100,
    durationMs: Date.now() - started,
    commit: options.commit,
    summary: verdict.summary,
  };
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      max: { type: "string" },
      "subject-model": { type: "string" },
      "judge-model": { type: "string" },
      keep: { type: "boolean", default: false },
    },
  });
  const cases = selectCases(discoverCases(), positionals, values.max ? Number(values.max) : undefined);
  if (cases.length === 0) {
    process.stdout.write(`evals: no cases for ${positionals.join(", ") || "any skill"}\n`);
    return;
  }
  const commit = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  const options = {
    runId: new Date().toISOString().replace(/[:.]/g, "-"),
    commit,
    subjectModel: values["subject-model"] ?? readEvolutionConfig(root).models.build,
    judgeModel: values["judge-model"] ?? DEFAULT_JUDGE_MODEL,
    keep: values.keep,
  };
  process.stdout.write(`evals: ${String(cases.length)} case(s) at ${commit.slice(0, 7)}, subject ${options.subjectModel}, judge ${options.judgeModel}\n`);
  let failed = 0;
  for (const evalCase of cases) {
    const result = runCase(evalCase, options);
    appendFileSync(join(evalsDir, "results.jsonl"), `${JSON.stringify(result)}\n`);
    if (!result.passed) failed += 1;
    process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.skill}/${result.case} ${String(result.score)}/10 (verify ${result.ranVerify ? "run" : "not run"}, $${String(result.costUsd)}): ${result.summary}\n`);
  }
  process.stdout.write(`evals: ${String(cases.length - failed)}/${String(cases.length)} passed. Full runs in artifacts/evals/${options.runId}/\n`);
  if (failed > 0) process.exitCode = 1;
}

main();
