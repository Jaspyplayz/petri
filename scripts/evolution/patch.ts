import type { GuardrailsConfig } from "../check-pr/config";
import type { NumstatEntry } from "../check-pr/git";
import { measurePullRequest } from "../check-pr/pr-size";
import { isProtectedPath } from "../check-pr/protected-paths";

export type RawChange = { readonly oldMode: string; readonly newMode: string; readonly status: string; readonly path: string };

const REGULAR_FILE = "100644";
const NONE = "000000";

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

// The builder's patch is checked after git applied it to a scratch index from the base commit, so the paths and modes
// are what git would really write: the protected paths and size cap CI enforces on agent PRs (with no human-label
// escape), and only plain, non-executable files (no symlinks, submodules or binaries).
export function patchProblems(raw: readonly RawChange[], entries: readonly NumstatEntry[], config: GuardrailsConfig): string[] {
  if (raw.length === 0) return ["the patch changes nothing"];
  const problems = raw.filter((change) => isProtectedPath(change.path, config)).map((change) => `${change.path} is a protected path`);
  for (const change of raw) {
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
