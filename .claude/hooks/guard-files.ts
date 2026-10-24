import { fileProblem } from "./lib/files.ts";
import { block, type HookInput, parseHookInput, readStdin } from "./lib/hook-input.ts";
import { postmortemWritable, projectRoot, protectedRepoPath, secretTarget } from "./lib/paths.ts";

function problemFor(input: HookInput): string | undefined {
  const cwd = input.cwd ?? projectRoot;
  const guard = { projectRoot, caseInsensitive: process.platform === "win32" };
  return fileProblem(input, {
    evolutionHuman: process.env.EVOLUTION_HUMAN === "1",
    protectedTarget: (path) => protectedRepoPath(path, cwd, guard),
    secretPath: (path) => secretTarget(path, cwd, guard.caseInsensitive),
    ...(process.env.EVOLUTION_POSTMORTEM === "1" ? { postmortemWritable: (path: string) => postmortemWritable(path, cwd, guard) } : {}),
  });
}

let problem: string | undefined;
try {
  problem = problemFor(parseHookInput(await readStdin()));
} catch (error) {
  problem = `Blocked: the file guard failed (${String(error)}), and it fails closed.`;
}
if (problem !== undefined) block(problem);
