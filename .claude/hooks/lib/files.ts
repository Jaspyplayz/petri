import { globToRegExp } from "../../../scripts/check-pr/glob.ts";
import { isSecretFile } from "./paths.ts";

export type FileGuard = {
  readonly evolutionHuman: boolean;
  readonly protectedTarget: (path: string) => string | undefined;
  readonly secretPath: (path: string) => boolean;
  readonly postmortemProblem?: (path: string) => string | undefined;
};

export type ToolCall = {
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
};

const readers = new Set(["Read", "Grep"]);
const writers = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const secretSamples = [
  ...[".env", ".env.local", ".env.setup", ".env.production", ".env.development", ".env.test", ".env.staging", ".env.production.local"],
  ...[".git-credentials", ".netrc", "_netrc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"],
];
const maxExpansions = 256;
const secretMessage = "Blocked: env and credential files hold secrets, so agents neither read nor write them. Scripts such as `pnpm setup:secrets` and `pnpm env:local` handle them.";

function expandBraces(glob: string): string[] | undefined {
  const open = glob.indexOf("{");
  if (open === -1) return glob.includes("}") ? undefined : [glob];
  const bounds = [open];
  let depth = 0;
  for (let index = open; index < glob.length; index += 1) {
    const char = glob.charAt(index);
    if (char === "{") depth += 1;
    if (char === "," && depth === 1) bounds.push(index);
    if (char === "}") depth -= 1;
    if (depth === 0) {
      const expanded: string[] = [];
      for (const [position, start] of bounds.entries()) {
        const option = glob.slice(start + 1, bounds[position + 1] ?? index);
        const rest = expandBraces(`${glob.slice(0, open)}${option}${glob.slice(index + 1)}`);
        if (rest === undefined) return undefined;
        expanded.push(...rest);
        if (expanded.length > maxExpansions) return undefined;
      }
      return expanded;
    }
  }
  return undefined;
}

function globReadsSecrets(glob: string): boolean {
  const alternatives = expandBraces(glob.replace(/\\(.)/g, "$1").replace(/\[[^\]]*\]/g, "?"));
  if (alternatives === undefined) return true;
  return alternatives.some((alternative) => {
    if (alternative.startsWith("!")) return false;
    const plain = alternative.replace(/^\//, "");
    if (isSecretFile(plain)) return true;
    const lastSegment = plain.split("/").at(-1) ?? "";
    const finalPattern = lastSegment === "" || lastSegment === "**" ? /.*/ : globToRegExp(lastSegment);
    return secretSamples.some((name) => finalPattern.test(name));
  });
}

function pathOf(toolInput: Readonly<Record<string, unknown>>): string | undefined {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = toolInput[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

export function fileProblem(call: ToolCall, guard: FileGuard): string | undefined {
  const path = pathOf(call.toolInput);
  const glob = call.toolInput.glob;
  if (call.toolName === "Grep" && typeof glob === "string" && globReadsSecrets(glob)) return secretMessage;
  if (path === undefined || (!readers.has(call.toolName) && !writers.has(call.toolName))) return undefined;
  if (guard.secretPath(path)) return secretMessage;
  if (!writers.has(call.toolName) || guard.evolutionHuman) return undefined;
  const protectedPath = guard.protectedTarget(path);
  if (protectedPath === undefined) return undefined;
  const postmortem = guard.postmortemProblem?.(path);
  if (guard.postmortemProblem !== undefined && postmortem === undefined) return undefined;
  return [
    `Blocked: ${protectedPath} is a protected path (protectedPaths in .github/guardrails.json, or a Claude Code settings file).`,
    "Agents can't change their own guardrails. If the change is needed, explain why and ask a human,",
    "who can make it or start Claude Code with EVOLUTION_HUMAN=1.",
    ...(postmortem === undefined ? [] : [`For a postmortem: ${postmortem} (postmortem in .github/guardrails.json). Put a fix you can't make in your report's forAHuman.`]),
  ].join(" ");
}
