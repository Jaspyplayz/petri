import { asRecord } from "../../scripts/check-pr/json.ts";
import { commandProblem, pathProblem } from "./lib/commands.ts";
import { block, type HookInput, parseHookInput, readStdin } from "./lib/hook-input.ts";
import { projectRoot, protectedRepoPath, secretTarget } from "./lib/paths.ts";

const shellTools = new Set(["Bash", "PowerShell"]);
const shellLanguages = new Set(["shell", "bash", "sh", "zsh", "powershell", "pwsh"]);
const languageKeys = ["language", "lang", "runtime", "interpreter"];
const codeToolName = /python|eval|script|code|javascript|node|ruby|deno|repl/i;
const unguardableCode =
  "Blocked: this tool runs code the guard can't check (it can write any file), so agents run only shell through it. Use Bash or the Edit/Write tools; a human can allow it with EVOLUTION_HUMAN=1.";

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  const record = asRecord(value);
  return record ? Object.values(record).flatMap(stringsIn) : [];
}

function problemFor(input: HookInput): string | undefined {
  const cwd = input.cwd ?? projectRoot;
  const paths = { projectRoot, caseInsensitive: process.platform === "win32" };
  const guard = {
    evolutionHuman: process.env.EVOLUTION_HUMAN === "1",
    powershell: input.toolName === "PowerShell",
    protectedTarget: (path: string) => protectedRepoPath(path, cwd, paths),
    secretPath: (path: string) => secretTarget(path, cwd, paths.caseInsensitive),
  };
  if (shellTools.has(input.toolName)) {
    const command = input.toolInput.command;
    return typeof command === "string" ? commandProblem(command, guard) : `Blocked: ${input.toolName} hook input has no command string.`;
  }
  const declared = languageKeys.map((key) => input.toolInput[key]).filter((value) => typeof value === "string");
  const runsShell = declared.length > 0 && declared.every((language) => shellLanguages.has(language.toLowerCase()));
  const mayRunOtherCode = codeToolName.test(input.toolName) || (declared.length > 0 && !runsShell);
  if (mayRunOtherCode && !guard.evolutionHuman) return unguardableCode;
  return stringsIn(input.toolInput)
    .map((text) => pathProblem(text, guard) ?? commandProblem(text, guard))
    .find((problem) => problem !== undefined);
}

let problem: string | undefined;
try {
  problem = problemFor(parseHookInput(await readStdin()));
} catch (error) {
  problem = `Blocked: the command guard failed (${String(error)}), and it fails closed.`;
}
if (problem !== undefined) block(problem);
