import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectRoot } from "./lib/paths";

function runHook(script: string, payload: unknown, env: Readonly<Record<string, string>> = {}) {
  const result = spawnSync(process.execPath, [join(projectRoot, ".claude/hooks", script)], {
    cwd: projectRoot,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, EVOLUTION_HUMAN: "", ...env },
  });
  return { status: result.status, stderr: result.stderr };
}

const toolCall = (toolName: string, toolInput: Record<string, unknown>) => ({
  hook_event_name: "PreToolUse",
  cwd: projectRoot,
  tool_name: toolName,
  tool_input: toolInput,
});

describe("guard-commands hook", () => {
  it("exits 2 with the reason on stderr for a blocked command", () => {
    const result = runHook("guard-commands.ts", toolCall("Bash", { command: "git push --force" }));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("force pushes");
  });

  it("exits 0 for an ordinary command, from Bash or PowerShell", () => {
    expect(runHook("guard-commands.ts", toolCall("Bash", { command: "pnpm test" })).status).toBe(0);
    expect(runHook("guard-commands.ts", toolCall("PowerShell", { command: "Get-ChildItem src" })).status).toBe(0);
  });

  it("fails closed on input it can't read", () => {
    expect(runHook("guard-commands.ts", "not json").status).not.toBe(0);
    expect(runHook("guard-commands.ts", toolCall("Bash", {})).status).toBe(2);
  });
});

describe("guard-files hook", () => {
  const write = toolCall("Write", { file_path: join(projectRoot, "eslint.config.mjs"), content: "" });

  it("blocks protected paths unless EVOLUTION_HUMAN=1", () => {
    const blocked = runHook("guard-files.ts", write);
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain("eslint.config.mjs is a protected path");
    expect(runHook("guard-files.ts", write, { EVOLUTION_HUMAN: "1" }).status).toBe(0);
  });
});

describe("check-file hook", { timeout: 120_000 }, () => {
  const postToolUse = (path: string) => ({ ...toolCall("Write", { file_path: path, content: "" }), hook_event_name: "PostToolUse" });

  it("ignores files outside src/", () => {
    expect(runHook("check-file.ts", postToolUse(join(projectRoot, "README.md"))).status).toBe(0);
  });

  it("passes a clean src file and reports typecheck and lint errors to the agent", () => {
    expect(runHook("check-file.ts", postToolUse(join(projectRoot, "src/features/blob/lib/blob-state.ts"))).status).toBe(0);
    const probe = join(projectRoot, `src/shared/lib/hook-probe-${String(process.pid)}.ts`);
    writeFileSync(probe, 'export const typed: number = "text";\nexport const loose: any = 1;\n');
    try {
      const result = runHook("check-file.ts", postToolUse(probe));
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("TS2322");
      expect(result.stderr).toContain("@typescript-eslint/no-explicit-any");
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
