import { commandProblem } from "./lib/commands.ts";
import { block, parseHookInput, readStdin } from "./lib/hook-input.ts";
import { projectRoot, protectedRepoPath } from "./lib/paths.ts";

const input = parseHookInput(await readStdin());
const command = input.toolInput.command;
if (typeof command !== "string") block(`${input.toolName} hook input has no command string`);
const guard = { projectRoot, caseInsensitive: process.platform === "win32" };
const problem = commandProblem(command, {
  evolutionHuman: process.env.EVOLUTION_HUMAN === "1",
  protectedTarget: (path) => protectedRepoPath(path, input.cwd ?? projectRoot, guard),
});
if (problem !== undefined) block(problem);
