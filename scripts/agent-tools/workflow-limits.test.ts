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
      - name: Context
        env:
          TOKEN: \${{ secrets.TOKEN }}
        run: |
          set -euo pipefail
          [ -n "$TOKEN" ] && echo "token is set"
      - name: Agent sandbox
        run: |
          sudo apt-get install -y --no-install-recommends bubblewrap socat
          sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
      - uses: anthropics/claude-code-action@${SHA} # v1.0.259
        env:
          CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"
        with:
          claude_args: "--max-turns 30 --allowedTools Read"
`;

const PRINT = "print" + "env";

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
      "claude.yml: job claude runs claude-code-action without env CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: \"1\"",
      "claude.yml: job claude runs claude-code-action before a step that installs bubblewrap and allows user namespaces",
      "claude.yml: job claude uses anthropics/claude-code-action@v1; pin claude-code-action to a commit SHA",
      "claude.yml: job claude runs claude-code-action without --max-turns in claude_args",
    ]);
  });

  it("refuses an agent step whose secret scrub is off", () => {
    expect(workflowLimitProblems("w.yml", good.replace('SCRUB: "1"', 'SCRUB: "0"'))).toEqual([
      'w.yml: job agent runs claude-code-action without env CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"',
    ]);
  });

  it("refuses an agent step with no bubblewrap install before it in the same job", () => {
    const missing = "w.yml: job agent runs claude-code-action before a step that installs bubblewrap and allows user namespaces";
    const sandbox = "      - name: Agent sandbox\n        run: |\n          sudo apt-get install -y --no-install-recommends bubblewrap socat\n          sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0\n";
    expect(good).toContain(sandbox);
    expect(workflowLimitProblems("w.yml", good.replace("bubblewrap socat", "socat"))).toEqual([missing]);
    expect(workflowLimitProblems("w.yml", good.replace("          sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0\n", ""))).toEqual([missing]);
    expect(workflowLimitProblems("w.yml", `${good.replace(sandbox, "")}${sandbox}`)).toEqual([missing]);
  });

  it("refuses a run step that gets the Claude token before the bubblewrap install", () => {
    const evals = (token: string) =>
      `${good}      - name: Run the evals\n        env:\n          ${token}: \${{ secrets.X }}\n        run: pnpm evals\n`;
    expect(workflowLimitProblems("w.yml", evals("CLAUDE_CODE_OAUTH_TOKEN"))).toEqual([]);
    expect(workflowLimitProblems("w.yml", evals("OTHER_TOKEN"))).toEqual([]);
    const early = good.replace("      - name: Context\n        env:\n          TOKEN:", "      - name: Context\n        env:\n          ANTHROPIC_API_KEY:");
    expect(workflowLimitProblems("w.yml", early)).toEqual([
      'w.yml: job agent, "Context" gets the Claude token before a step that installs bubblewrap and allows user namespaces',
    ]);
  });

  it("refuses a secret written into a script and every way a step prints the environment", () => {
    const inline = good.replace('[ -n "$TOKEN" ]', "curl -H \"x: ${{ secrets.TOKEN }}\" x.dev; [ -n \"$TOKEN\" ]");
    expect(workflowLimitProblems("w.yml", inline)).toEqual(['w.yml: job agent, "Context" puts a secret in the script; pass it through env:']);
    for (const dump of [PRINT, `${PRINT} TOKEN`, "env", "env | sort", "env > all.txt", "set", "export -p", "declare -x", "set -x", "set -eux", "set -o xtrace", "bash -x run.sh", "true && env"]) {
      expect(workflowLimitProblems("w.yml", good.replace("set -euo pipefail", dump)), dump).toEqual(['w.yml: job agent, "Context" prints the environment']);
    }
  });

  it("allows scripts that only mention env in passing", () => {
    for (const line of ["echo env-ok", "node scripts/env-local.ts", "pnpm env:local", "cat .env.example", "set -euo pipefail", "VAR=1 env-tool"]) {
      expect(workflowLimitProblems("w.yml", good.replace("set -euo pipefail", line)), line).toEqual([]);
    }
  });

  it("refuses write permissions at the top and timeouts that are missing or too long", () => {
    const text = good.replace("  contents: read\njobs", "  contents: write\njobs").replace("timeout-minutes: 20", "timeout-minutes: 600");
    expect(workflowLimitProblems("w.yml", text)).toEqual([
      "w.yml: top-level permissions give contents: write to every job; grant it in the job that needs it",
      "w.yml: job agent needs timeout-minutes between 1 and 240",
    ]);
  });

  it("refuses an app token mint that names no permissions, or one the evolution app doesn't have", () => {
    const mint = (inputs: string) =>
      `permissions:\n  contents: read\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    steps:\n      - id: app-token\n        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0\n        with:\n          client-id: x\n          private-key: x\n${inputs}`;
    expect(workflowLimitProblems("w.yml", mint("          permission-contents: write\n          permission-issues: read\n"))).toEqual([]);
    expect(workflowLimitProblems("w.yml", mint(""))).toEqual([
      "w.yml: job publish mints an app token without permission-* inputs, so it gets every permission the app has",
    ]);
    expect(workflowLimitProblems("w.yml", mint("          permission-contents: write\n          permission-workflows: write\n          permission-actions: read\n"))).toEqual([
      "w.yml: job publish asks its app token for workflows; the app may only have contents, issues, pull-requests, metadata",
      "w.yml: job publish asks its app token for actions; the app may only have contents, issues, pull-requests, metadata",
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
  const workflows = readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => [file, readFileSync(join(dir, file), "utf8")] as const);
  it("keeps the limits", () => {
    expect(workflows.flatMap(([file, text]) => workflowLimitProblems(file, text))).toEqual([]);
  });

  it("sees every job that mints the evolution app token", () => {
    const unscoped = workflows.flatMap(([file, text]) => workflowLimitProblems(file, text.replace(/^ +permission-[a-z-]+: \w+\r?\n/gm, "")));
    expect(unscoped.filter((problem) => problem.includes(" mints an app token ")).map((problem) => problem.split(" mints")[0])).toEqual([
      "evolution-automerge.yml: job automerge",
      "evolution-build.yml: job publish",
      "evolution-guardian.yml: job guardian",
      "evolution-postmortem.yml: job publish",
      "evolution-triage.yml: job triage",
    ]);
  });
});
