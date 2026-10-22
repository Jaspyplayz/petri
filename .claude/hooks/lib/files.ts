import { isSecretFile } from "./paths.ts";

export type FileGuard = {
  readonly evolutionHuman: boolean;
  readonly protectedTarget: (path: string) => string | undefined;
};

export type ToolCall = {
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
};

const readers = new Set(["Read", "Grep"]);
const writers = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function pathOf(toolInput: Readonly<Record<string, unknown>>): string | undefined {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = toolInput[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

export function fileProblem(call: ToolCall, guard: FileGuard): string | undefined {
  const path = pathOf(call.toolInput);
  if (path === undefined || (!readers.has(call.toolName) && !writers.has(call.toolName))) return undefined;
  if (isSecretFile(path)) {
    return "Blocked: env and credential files hold secrets, so agents neither read nor write them. Scripts such as `pnpm setup:secrets` and `pnpm env:local` handle them.";
  }
  if (!writers.has(call.toolName) || guard.evolutionHuman) return undefined;
  const protectedPath = guard.protectedTarget(path);
  if (protectedPath === undefined) return undefined;
  return [
    `Blocked: ${protectedPath} is a protected path (protectedPaths in .github/guardrails.json).`,
    "Agents can't change their own guardrails. If the change is needed, explain why and ask a human,",
    "who can make it or start Claude Code with EVOLUTION_HUMAN=1.",
  ].join(" ");
}
