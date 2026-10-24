import type { GuardrailsConfig } from "./config.ts";
import { type GlobOptions, matchesAny, toRepoPath } from "./glob.ts";

export type PathChange = "add" | "modify" | "delete";

export type PostmortemPathOptions = GlobOptions & {
  readonly protectedPath: boolean;
  readonly existing?: Iterable<string>;
};

const PLAIN_PATH = /^[A-Za-z0-9._/-]+$/;
const AGENT_INSTRUCTIONS = /^(CLAUDE|CLAUDE\.local|AGENTS)\.md$/i;

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function stem(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");
}

// An added file whose name differs from one HEAD has only in case overwrites it on a case-insensitive checkout, and one
// that shares its name but not its extension can be what an import without an extension resolves to (Vite tries .mjs
// and .js before .ts). existing holds HEAD's files and folders, as repo paths.
function clash(path: string, existing: Iterable<string>): string | undefined {
  const lower = path.toLowerCase();
  const folder = folderOf(lower);
  for (const entry of existing) {
    const other = entry.toLowerCase();
    if (folderOf(other) !== folder) continue;
    if (other === lower) return `a postmortem can't add a file whose name differs only in case from ${entry}`;
    if (stem(other) === stem(lower)) return `a postmortem can't add a file named like ${entry} with another extension, which an import could pick instead`;
  }
  return undefined;
}

// Why the postmortem agent can't make this change, or undefined if it can. On any path it never writes a dotfile, a
// dot folder or a nested CLAUDE.md or AGENTS.md, which git or Claude Code would read as config, nor adds a file that
// clashes with one HEAD has. On a protected path it may add a file on postmortem.addPaths and change one on
// postmortem.modifyPaths (.github/guardrails.json), with a plain name the PR body can quote, and never delete one.
export function postmortemPathProblem(path: string, change: PathChange, config: GuardrailsConfig, options: PostmortemPathOptions): string | undefined {
  const repoPath = toRepoPath(path);
  const segments = repoPath.split("/");
  if (change === "delete") return options.protectedPath ? "a postmortem can't delete a protected file" : undefined;
  if (segments.some((segment, index) => segment.startsWith(".") && (index > 0 || !options.protectedPath))) {
    return "a postmortem can't write a dotfile or into a dot folder";
  }
  if (repoPath !== "CLAUDE.md" && AGENT_INSTRUCTIONS.test(segments.at(-1) ?? "")) return "a postmortem can change only the root CLAUDE.md";
  const clashing = change === "add" && options.existing !== undefined ? clash(repoPath, options.existing) : undefined;
  if (clashing !== undefined) return clashing;
  if (!options.protectedPath) return undefined;
  if (!PLAIN_PATH.test(repoPath)) return "a postmortem's protected paths use only letters, digits, '.', '_', '-' and '/'";
  const { addPaths, modifyPaths } = config.postmortem;
  if (matchesAny(repoPath, change === "add" ? addPaths : modifyPaths, options)) return undefined;
  if (change === "modify" && matchesAny(repoPath, addPaths, options)) return "a postmortem may add files here but not change existing ones";
  return "a postmortem can't write this protected path";
}
