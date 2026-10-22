import { fileProblem } from "./lib/files.ts";
import { block, parseHookInput, readStdin } from "./lib/hook-input.ts";
import { projectRoot, protectedRepoPath, secretTarget } from "./lib/paths.ts";

const input = parseHookInput(await readStdin());
const guard = { projectRoot, caseInsensitive: process.platform === "win32" };
const problem = fileProblem(input, {
  evolutionHuman: process.env.EVOLUTION_HUMAN === "1",
  protectedTarget: (path) => protectedRepoPath(path, input.cwd ?? projectRoot, guard),
  secretPath: (path) => secretTarget(path, input.cwd ?? projectRoot, guard.caseInsensitive),
});
if (problem !== undefined) block(problem);
