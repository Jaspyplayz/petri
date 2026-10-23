import { spawnSync } from "node:child_process";
import type { BuiltIssue } from "./build";
import { issueFromBody } from "./triage-output";

export type GhIssue = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly state: string;
  readonly labels: readonly { readonly name: string }[];
};

export const ISSUE_FIELDS = "number,title,body,url,state,labels";

export function gh(root: string, args: readonly string[]): string {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`gh ${args[0] ?? ""} ${args[1] ?? ""} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout.trim();
}

// An issue is buildable only if triage filed it: open, labelled evolution and evolution:ready, with a valid data comment.
export function buildableIssue(issue: GhIssue, options: { requireReady: boolean }): { issue: BuiltIssue } | { problem: string } {
  const labels = issue.labels.map((label) => label.name);
  if (issue.state !== "OPEN") return { problem: "it isn't open" };
  if (!labels.includes("evolution")) return { problem: "it doesn't have the evolution label" };
  if (options.requireReady && !labels.includes("evolution:ready")) return { problem: "it doesn't have the evolution:ready label" };
  const fields = issueFromBody(issue.body);
  if (fields === undefined) return { problem: "its body has no valid evolution-issue data comment (only triage files buildable issues)" };
  return { issue: { ...fields, number: issue.number, url: issue.url } };
}

// Privileged steps read the issue from GitHub again rather than trusting a file in the workspace.
export function fetchIssue(root: string, issueNumber: number, options: { requireReady: boolean }): BuiltIssue {
  const issue = JSON.parse(gh(root, ["issue", "view", String(issueNumber), "--json", ISSUE_FIELDS])) as GhIssue;
  const result = buildableIssue(issue, options);
  if ("problem" in result) throw new Error(`#${String(issueNumber)} can't be used: ${result.problem}`);
  return result.issue;
}

export function issueNumberArg(value: string | undefined, usage: string): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) throw new Error(usage);
  return Number(value);
}
