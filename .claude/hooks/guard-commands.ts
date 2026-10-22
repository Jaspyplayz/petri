import { asRecord } from "../../scripts/check-pr/json.ts";
import { commandProblem, pathProblem } from "./lib/commands.ts";
import { block, type HookInput, parseHookInput, readStdin } from "./lib/hook-input.ts";
import { projectRoot, protectedRepoPath, secretTarget } from "./lib/paths.ts";

const shellTools = new Set(["Bash", "PowerShell"]);

function commandsOf(toolInput: HookInput["toolInput"]): string[] {
  const batch = Array.isArray(toolInput.commands) ? toolInput.commands : [];
  return [toolInput.command, toolInput.code, ...batch.map((entry) => asRecord(entry)?.command)].filter((value) => typeof value === "string");
}

function problemFor(input: HookInput): string | undefined {
  const commands = commandsOf(input.toolInput);
  if (commands.length === 0 && shellTools.has(input.toolName)) return `Blocked: ${input.toolName} hook input has no command string.`;
  const cwd = input.cwd ?? projectRoot;
  const paths = { projectRoot, caseInsensitive: process.platform === "win32" };
  const guard = {
    evolutionHuman: process.env.EVOLUTION_HUMAN === "1",
    protectedTarget: (path: string) => protectedRepoPath(path, cwd, paths),
    secretPath: (path: string) => secretTarget(path, cwd, paths.caseInsensitive),
  };
  const path = input.toolInput.path;
  return (typeof path === "string" ? pathProblem(path, guard) : undefined) ?? commands.map((command) => commandProblem(command, guard)).find((problem) => problem !== undefined);
}

let problem: string | undefined;
try {
  problem = problemFor(parseHookInput(await readStdin()));
} catch (error) {
  problem = `Blocked: the command guard failed (${String(error)}), and it fails closed.`;
}
if (problem !== undefined) block(problem);
