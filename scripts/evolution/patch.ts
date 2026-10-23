import type { GuardrailsConfig } from "../check-pr/config";
import type { NumstatEntry } from "../check-pr/git";
import { measurePullRequest } from "../check-pr/pr-size";
import { isProtectedPath } from "../check-pr/protected-paths";

// The builder's patch is checked before it's applied anywhere: the same protected paths and size cap CI enforces on
// agent PRs, with no human-label escape, and no binary files.
export function patchProblems(entries: readonly NumstatEntry[], config: GuardrailsConfig): string[] {
  if (entries.length === 0) return ["the patch changes nothing"];
  const problems = entries.filter((entry) => isProtectedPath(entry.path, config)).map((entry) => `${entry.path} is a protected path`);
  const size = measurePullRequest(entries, config.prSize.ignoredPaths);
  problems.push(...size.binary.map((path) => `${path} is binary`));
  if (size.total > config.prSize.maxChangedLines) {
    problems.push(`${String(size.total)} changed lines is over the ${String(config.prSize.maxChangedLines)}-line cap for agent PRs`);
  }
  return problems;
}
