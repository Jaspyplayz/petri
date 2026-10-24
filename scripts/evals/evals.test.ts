import { describe, expect, it } from "vitest";
import { pnpmRuleProblem, splitRules } from "../agent-tools/allowed-tools";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUBJECT_ALLOWED_TOOLS, claudeEnv, judgePrompt, redactCredentials, withoutSecrets } from "./agents";
import { caseProblems, selectCases, type EvalCase } from "./cases";
import { formatReport, parseResults, type EvalResult } from "./results";
import { bashCommands, condenseTranscript, ranVerify } from "./transcript";

const root = join(import.meta.dirname, "..", "..");
const scripts = new Set(Object.keys((JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts));

describe("caseProblems", () => {
  it("accepts a complete case", () => {
    expect(caseProblems("verify-app", "01-reproduce-first", ["task.md", "setup.sh", "rubric.md"])).toEqual([]);
  });

  it("names missing files and a bad folder name", () => {
    expect(caseProblems("verify-app", "first", ["task.md"])).toEqual([
      "evals/verify-app/cases/first: missing setup.sh",
      "evals/verify-app/cases/first: missing rubric.md",
      "evals/verify-app/cases/first: name it NN-kebab-case, like 01-reproduce-first",
    ]);
  });
});

describe("selectCases", () => {
  const cases: EvalCase[] = [
    { skill: "verify-app", id: "02-b", dir: "" },
    { skill: "verify-app", id: "01-a", dir: "" },
    { skill: "postmortem", id: "01-a", dir: "" },
  ];

  it("filters by skill, sorts, and caps per skill", () => {
    expect(selectCases(cases, ["verify-app"], 1).map((c) => c.id)).toEqual(["01-a"]);
    expect(selectCases(cases, [], undefined).map((c) => `${c.skill}/${c.id}`)).toEqual(["postmortem/01-a", "verify-app/01-a", "verify-app/02-b"]);
  });
});

describe("transcript", () => {
  const lines = [
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Reproducing first." }, { type: "tool_use", name: "Bash", input: { command: "pnpm verify:flow blob.feed" } }] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "FAIL blob.feed", is_error: true }] } }),
    "not json",
  ];

  it("lists the shell commands and spots a verify run", () => {
    expect(bashCommands(lines)).toEqual(["pnpm verify:flow blob.feed"]);
    expect(ranVerify(bashCommands(lines))).toBe(true);
    expect(ranVerify(["pnpm check", "pnpm test"])).toBe(false);
  });

  it("condenses it for the judge", () => {
    const text = condenseTranscript(lines);
    expect(text).toContain("**Agent:** Reproducing first.");
    expect(text).toContain('**Tool Bash:** `{"command":"pnpm verify:flow blob.feed"}`');
    expect(text).toContain("**Result (error):**");
  });
});

describe("the subject's allow-list", () => {
  it("only names whole package.json scripts", () => {
    expect(splitRules(SUBJECT_ALLOWED_TOOLS).map((rule) => pnpmRuleProblem(rule, scripts)).filter(Boolean)).toEqual([]);
  });
});

describe("judgePrompt", () => {
  it("includes the task, the rubric and the runner's own verify check", () => {
    const prompt = judgePrompt("Fix the feed button.", "10: reproduced first.", false);
    expect(prompt).toContain("Fix the feed button.");
    expect(prompt).toContain("10: reproduced first.");
    expect(prompt).toContain("did NOT run a pnpm verify command");
  });
});

describe("formatReport", () => {
  const base: EvalResult = {
    date: "2026-10-23T10:00:00Z",
    runId: "r1",
    skill: "verify-app",
    case: "01-a",
    subjectModel: "claude-opus-5-5",
    judgeModel: "claude-sonnet-5-5",
    score: 6,
    passed: false,
    ranVerify: true,
    costUsd: 1,
    durationMs: 1000,
    commit: "abc",
    summary: "",
  };

  it("shows the latest score per case and the average per skill", () => {
    const later = { ...base, date: "2026-10-24T10:00:00Z", runId: "r2", score: 9, passed: true };
    const report = formatReport(parseResults(`${JSON.stringify(base)}\n${JSON.stringify(later)}\n`));
    expect(report).toContain("| verify-app | 01-a | 9/10 | yes | yes | 2 | claude-opus-5-5 | 2026-10-24 |");
    expect(report).toContain("- verify-app: 9.0/10 over 1 case(s)");
  });

  it("says when there's nothing yet", () => {
    expect(formatReport([])).toBe("No eval results yet. Run pnpm evals.\n");
  });
});

describe("the agents' environment", () => {
  const env = {
    PATH: "/usr/bin",
    HOME: "/home/runner",
    CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-secret-value",
    GH_TOKEN: "ghp_secret",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RATE_LIMIT_SALT: "salt",
    SENTRY_DSN: "https://dsn",
    UNSET: undefined,
  };

  it("gives setup and tools no secrets at all", () => {
    expect(withoutSecrets(env)).toEqual({ PATH: "/usr/bin", HOME: "/home/runner" });
  });

  it("gives the CLI only its own credential, with the subprocess scrub on and no human switch", () => {
    expect(claudeEnv(env)).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/runner",
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-secret-value",
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1",
      EVOLUTION_HUMAN: "",
    });
  });

  it("redacts the credential from saved output", () => {
    expect(redactCredentials("token sk-ant-oat-secret-value twice sk-ant-oat-secret-value", env)).toBe("token [REDACTED] twice [REDACTED]");
    expect(redactCredentials("nothing here", { CLAUDE_CODE_OAUTH_TOKEN: "short" })).toBe("nothing here");
  });
});
