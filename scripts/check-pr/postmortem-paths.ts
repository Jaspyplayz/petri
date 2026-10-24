import type { GuardrailsConfig } from "./config.ts";
import { type GlobOptions, matchesAny, toRepoPath } from "./glob.ts";

export type PathChange = "add" | "modify" | "delete";

const PLAIN_PATH = /^[A-Za-z0-9._/-]+$/;
const AGENT_INSTRUCTIONS = /^(CLAUDE|CLAUDE\.local|AGENTS)\.md$/i;

// Why the postmortem agent can't make this change to a protected path, or undefined if it can. It may add a file on
// postmortem.addPaths and change one on postmortem.modifyPaths (.github/guardrails.json). It never deletes a protected
// file, and never writes a dotfile, a dot folder or a nested CLAUDE.md or AGENTS.md, which git or Claude Code would
// read as config, or a name the PR body can't quote plainly.
export function postmortemPathProblem(path: string, change: PathChange, config: GuardrailsConfig, options: GlobOptions = {}): string | undefined {
  const repoPath = toRepoPath(path);
  const segments = repoPath.split("/");
  if (change === "delete") return "a postmortem can't delete a protected file";
  if (!PLAIN_PATH.test(repoPath)) return "a postmortem's protected paths use only letters, digits, '.', '_', '-' and '/'";
  if (segments.slice(1).some((segment) => segment.startsWith("."))) return "a postmortem can't write a dotfile or into a dot folder";
  if (repoPath !== "CLAUDE.md" && AGENT_INSTRUCTIONS.test(segments.at(-1) ?? "")) return "a postmortem can change only the root CLAUDE.md";
  const { addPaths, modifyPaths } = config.postmortem;
  if (matchesAny(repoPath, change === "add" ? addPaths : modifyPaths, options)) return undefined;
  if (change === "modify" && matchesAny(repoPath, addPaths, options)) return "a postmortem may add files here but not change existing ones";
  return "a postmortem can't write this protected path";
}
