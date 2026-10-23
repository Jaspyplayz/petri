import type { GuardrailsConfig } from "../check-pr/config";
import { isEvolutionPr, PR_FIELDS, type GhPr } from "./github-pr";

export type ClosedGhPr = GhPr & { readonly state: string; readonly url: string };

export const CLOSED_PR_FIELDS = `${PR_FIELDS},state,url`;

// Why the PR's feedback stays as it is, or undefined when it goes back to triaged. A merged PR is post-merge's.
export function skipReason(pr: ClosedGhPr, config: GuardrailsConfig): string | undefined {
  if (pr.state !== "CLOSED") return `#${String(pr.number)} is ${pr.state.toLowerCase()}, not closed without merging`;
  if (!isEvolutionPr(pr, config)) return `#${String(pr.number)} isn't an evolution PR`;
  return undefined;
}

// The branch to delete after an evolution PR closed without merging, or undefined to keep it. Left behind, it blocks the
// next build of the same issue (same branch name). Only an evo/ branch of this repository, and only while it still
// points at the PR's last commit, so nothing pushed after the close is lost. The PR keeps its commits (refs/pull/N/head).
export function branchToDelete(pr: ClosedGhPr, branchSha: string | undefined): string | undefined {
  if (pr.isCrossRepository || !pr.headRefName.startsWith("evo/")) return undefined;
  return branchSha === pr.headRefOid ? pr.headRefName : undefined;
}

export function resetComment(pr: number, count: number): string {
  const items = count === 1 ? "1 feedback item is" : `${String(count)} feedback items are`;
  return `#${String(pr)} was closed without merging, so ${items} back to triaged, and the board no longer links to it. This issue stays open: dispatch the build again, or close it.`;
}
