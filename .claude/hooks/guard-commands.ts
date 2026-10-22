import { commandProblem } from "./lib/commands.ts";
import { block, type HookInput, parseHookInput, readStdin } from "./lib/hook-input.ts";
import { projectRoot, protectedRepoPath, secretTarget } from "./lib/paths.ts";

function problemFor(input: HookInput): string | undefined {
  const command = input.toolInput.command;
  if (typeof command !== "string") return `Blocked: ${input.toolName} hook input has no command string.`;
  const cwd = input.cwd ?? projectRoot;
  const guard = { projectRoot, caseInsensitive: process.platform === "win32" };
  return commandProblem(command, {
    evolutionHuman: process.env.EVOLUTION_HUMAN === "1",
    protectedTarget: (path) => protectedRepoPath(path, cwd, guard),
    secretPath: (path) => secretTarget(path, cwd, guard.caseInsensitive),
  });
}

let problem: string | undefined;
try {
  problem = problemFor(parseHookInput(await readStdin()));
} catch (error) {
  problem = `Blocked: the command guard failed (${String(error)}), and it fails closed.`;
}
if (problem !== undefined) block(problem);
