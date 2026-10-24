import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cronProblem, workflowLimitProblems } from "./workflow-limits";

const root = join(import.meta.dirname, "..", "..");
const SHA = "ae68417a745a5df4b2124873632bd73a2255e6f6";

const good = `
on:
  schedule:
    - cron: "*/15 * * * *"
permissions:
  contents: read
jobs:
  agent:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      issues: write
    steps:
      - uses: anthropics/claude-code-action@${SHA} # v1.0.259
        with:
          claude_args: "--max-turns 30 --allowedTools Read"
`;

describe("workflowLimitProblems", () => {
  it("passes a workflow that keeps every limit", () => {
    expect(workflowLimitProblems("good.yml", good)).toEqual([]);
  });

  it("reports what claude.yml looked like before Phase 8", () => {
    const before = `
on:
  issue_comment:
    types: [created]
jobs:
  claude:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: x
`;
    expect(workflowLimitProblems("claude.yml", before)).toEqual([
      'claude.yml: no top-level permissions; set "permissions: contents: read" and grant writes per job',
      "claude.yml: job claude needs timeout-minutes between 1 and 240",
      "claude.yml: job claude uses anthropics/claude-code-action@v1; pin claude-code-action to a commit SHA",
      "claude.yml: job claude runs claude-code-action without --max-turns in claude_args",
    ]);
  });

  it("refuses write permissions at the top and timeouts that are missing or too long", () => {
    const text = good.replace("  contents: read\njobs", "  contents: write\njobs").replace("timeout-minutes: 20", "timeout-minutes: 600");
    expect(workflowLimitProblems("w.yml", text)).toEqual([
      "w.yml: top-level permissions give contents: write to every job; grant it in the job that needs it",
      "w.yml: job agent needs timeout-minutes between 1 and 240",
    ]);
  });

  it("skips reusable-workflow jobs, which can't set a timeout", () => {
    expect(workflowLimitProblems("r.yml", "permissions:\n  contents: read\njobs:\n  call:\n    uses: ./.github/workflows/x.yml\n")).toEqual([]);
  });
});

describe("cronProblem", () => {
  it("allows a fixed minute, */15 or slower, and lists at least 15 minutes apart", () => {
    for (const cron of ["23 * * * *", "17 3 * * *", "*/15 * * * *", "*/30 * * * *", "0,15,30,45 * * * *", "5,35 * * * *"]) {
      expect(cronProblem(cron)).toBeUndefined();
    }
  });

  it("refuses every minute, short steps and close lists", () => {
    expect(cronProblem("* * * * *")).toMatch(/minute field/);
    expect(cronProblem("*/5 * * * *")).toMatch(/every 5 minutes/);
    expect(cronProblem("0,10 * * * *")).toMatch(/less than 15 minutes apart/);
    expect(cronProblem("50,0 * * * *")).toMatch(/less than 15 minutes apart/);
    expect(cronProblem("0-30 * * * *")).toMatch(/minute field/);
  });
});

describe("every workflow in .github/workflows", () => {
  const dir = join(root, ".github", "workflows");
  it("keeps the limits", () => {
    const problems = readdirSync(dir)
      .filter((file) => /\.ya?ml$/.test(file))
      .flatMap((file) => workflowLimitProblems(file, readFileSync(join(dir, file), "utf8")));
    expect(problems).toEqual([]);
  });
});
