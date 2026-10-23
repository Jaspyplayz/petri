import type { GuardrailsConfig } from "../check-pr/config";
import { branchName, prDataFromBody, type BuiltIssue } from "./build";
import { fetchIssue, gh } from "./github-issue";

export type GhPr = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly headRefName: string;
  readonly headRefOid: string;
  readonly baseRefOid: string;
  readonly isCrossRepository: boolean;
  readonly isDraft: boolean;
  readonly labels: readonly { readonly name: string }[];
};

export const PR_FIELDS = "number,title,body,headRefName,headRefOid,baseRefOid,isCrossRepository,isDraft,labels";

export function isEvolutionPr(pr: GhPr, config: GuardrailsConfig): boolean {
  return pr.labels.some((label) => config.agentPullRequests.labels.includes(label.name)) || pr.headRefName.startsWith("evo/");
}

// A PR as the REST API returns it (GET /repos/{repo}/commits/{sha}/pulls).
type RestPr = { readonly number: number; readonly state: string; readonly head: { readonly ref: string }; readonly labels: readonly { readonly name: string }[] };

// evolution-verify is a commit status, keyed by SHA: the other open evolution PRs whose head is this PR's head commit.
export function evolutionPrsSharingHead(root: string, repo: string, pr: GhPr, config: GuardrailsConfig): number[] {
  const prs = JSON.parse(gh(root, ["api", `repos/${repo}/commits/${pr.headRefOid}/pulls`])) as RestPr[];
  return prs
    .filter(
      (other) =>
        other.number !== pr.number &&
        other.state === "open" &&
        (other.head.ref.startsWith("evo/") || other.labels.some((label) => config.agentPullRequests.labels.includes(label.name))),
    )
    .map((other) => other.number);
}

// The issue an evolution PR implements, or why it can't be trusted to name one.
export function linkedIssue(root: string, pr: GhPr): BuiltIssue | string {
  // The build workflow pushes evolution branches to this repository, never to a fork.
  if (pr.isCrossRepository) return "an evolution PR has to come from a branch of this repository";
  const data = prDataFromBody(pr.body);
  if (data === undefined) return "the PR body has no valid evolution-pr data comment";
  const issue = fetchIssue(root, data.issueNumber, { requireReady: false });
  // The body names the issue, but anyone who can edit the PR can edit the body. The branch is the one the build
  // workflow derived from that issue, so a PR can't borrow another issue's criteria.
  const expected = branchName(issue.number, issue.title);
  if (pr.headRefName !== expected) return `the branch ${pr.headRefName} isn't ${expected}, the one built for #${String(issue.number)}`;
  return issue;
}
