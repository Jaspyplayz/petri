import type { GuardrailsConfig } from "../check-pr/config";
import type { NumstatEntry } from "../check-pr/git";
import { type PathChange, postmortemPathProblem } from "../check-pr/postmortem-paths";
import { measurePullRequest } from "../check-pr/pr-size";
import { isProtectedPath } from "../check-pr/protected-paths";

export type RawChange = { readonly oldMode: string; readonly newMode: string; readonly status: string; readonly path: string };

const REGULAR_FILE = "100644";
const NONE = "000000";
const ODD_NAME = /[\p{Cc}`]/u;
export const SKILL_FILE = /^\.claude\/skills\/[^/]+\/SKILL\.md$/;
const SKILL_KEYS = new Set(["name", "description"]);

// `git diff-index --raw -z --no-renames`: ":<old mode> <new mode> <old sha> <new sha> <status>\0<path>\0" per file.
export function parseRawZ(output: string): RawChange[] {
  const fields = output.split("\0");
  const changes: RawChange[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const meta = fields[index] ?? "";
    if (meta === "") continue;
    const [oldMode = "", newMode = "", , , status = ""] = meta.replace(/^:/, "").split(" ");
    changes.push({ oldMode, newMode, status, path: fields[index + 1] ?? "" });
  }
  return changes;
}

export function changeOf(status: string): PathChange {
  if (status === "A") return "add";
  return status === "D" ? "delete" : "modify";
}

// The builder's patch is checked after git applied it to a scratch index from the base commit, so the paths and modes
// are what git would really write: the protected paths and size cap CI enforces on agent PRs (with no human-label
// escape), and only plain, non-executable files (no symlinks, submodules or binaries) with plain names. A postmortem's
// patch may also make the changes postmortemPathProblem allows; its PR needs a human's protected-ok for them.
export function patchProblems(
  raw: readonly RawChange[],
  entries: readonly NumstatEntry[],
  config: GuardrailsConfig,
  options: { readonly postmortem?: boolean } = {},
): string[] {
  if (raw.length === 0) return ["the patch changes nothing"];
  const problems = raw.flatMap((change) => {
    if (!isProtectedPath(change.path, config)) return [];
    if (options.postmortem !== true) return [`${change.path} is a protected path`];
    const problem = postmortemPathProblem(change.path, changeOf(change.status), config);
    return problem === undefined ? [] : [`${change.path}: ${problem}`];
  });
  for (const change of raw) {
    if (ODD_NAME.test(change.path)) problems.push(`${JSON.stringify(change.path)} has a control character or a backtick in its name`);
    if (change.status !== "A" && change.status !== "M" && change.status !== "D") problems.push(`${change.path} has git status ${change.status}`);
    const modes = [change.oldMode, change.newMode].filter((mode) => mode !== NONE);
    if (modes.some((mode) => mode !== REGULAR_FILE)) problems.push(`${change.path} isn't a plain file (mode ${change.oldMode} → ${change.newMode})`);
  }
  const size = measurePullRequest(entries, config.prSize.ignoredPaths);
  problems.push(...size.binary.map((path) => `${path} is binary`));
  if (size.total > config.prSize.maxChangedLines) {
    problems.push(`${String(size.total)} changed lines is over the ${String(config.prSize.maxChangedLines)}-line cap for agent PRs`);
  }
  return problems;
}

// A skill a postmortem writes keeps the frontmatter every skill here has, name and description. Other keys, such as
// allowed-tools, hooks or model, would change what an agent may do while the skill is loaded.
export function skillFrontmatterProblem(text: string): string | undefined {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end === -1) return "a skill starts with --- frontmatter";
  const keys = lines.slice(1, end).flatMap((line) => (line === "" || /^\s/.test(line) ? [] : [/^([A-Za-z0-9_-]+):/.exec(line)?.[1] ?? line]));
  const extra = keys.filter((key) => !SKILL_KEYS.has(key));
  if (extra.length > 0) return `a postmortem's skill frontmatter has only name and description, not ${extra.join(", ")}`;
  return SKILL_KEYS.size === new Set(keys).size ? undefined : "a skill's frontmatter needs name and description";
}
