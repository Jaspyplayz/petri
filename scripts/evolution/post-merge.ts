import type { Database } from "../../src/shared/supabase/database.types";
import type { BuiltIssue, PrData } from "./build";
import { SCREENSHOT_BUCKET } from "./screenshots";

export type ChangelogInsert = Database["public"]["Tables"]["changelog"]["Insert"];

// A PR as GET /repos/{repo}/commits/{sha}/pulls returns it.
export type CommitPr = {
  readonly number: number;
  readonly merged_at: string | null;
  readonly merge_commit_sha: string | null;
  readonly base: { readonly ref: string };
};

// The PR whose squash merge is this commit on main. Any other PR that merely contains the commit doesn't count.
export function mergedPrNumber(prs: readonly CommitPr[], sha: string): number | undefined {
  return prs.find((pr) => pr.merged_at !== null && pr.merge_commit_sha === sha && pr.base.ref === "main")?.number;
}

export type CommitStatus = { readonly context: string; readonly state: string; readonly creator: { readonly login: string } | null };

// Vercel reports each deployment as a commit status (newest first). On a push to main it's the production deployment.
export function vercelDeployment(statuses: readonly CommitStatus[]): "ready" | "pending" | "failed" {
  const latest = statuses.find((status) => status.context === "Vercel" && status.creator?.login === "vercel[bot]");
  if (latest === undefined || latest.state === "pending") return "pending";
  return latest.state === "success" ? "ready" : "failed";
}

// The bullets under "## What changed" in an evolution PR body (renderPrBody writes them, defanged).
export function whatChanged(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const start = lines.indexOf("## What changed");
  if (start === -1) return [];
  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.startsWith("- ") && line.slice(2).trim() !== "") bullets.push(line.slice(2).trim());
  }
  return bullets;
}

// changelog.summary is 1–2000 characters.
const SUMMARY_MAX = 2000;

// The plain-English paragraph on the Timeline: the issue's user story, then what changed.
export function changelogSummary(userStory: string, changes: readonly string[]): string {
  const sentences = [userStory, ...changes].map((text) => text.replace(/\s+/g, " ").trim()).filter((text) => text !== "");
  const text = sentences.map((sentence) => (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`)).join(" ");
  return text.length <= SUMMARY_MAX ? text : `${text.slice(0, SUMMARY_MAX - 1)}…`;
}

// Screenshot URLs come from the PR body, which anyone who can edit the PR can change, so only files in this project's
// public screenshot bucket reach the Timeline. URL parsing resolves "..", so a path can't climb out of the bucket.
export function trustedScreenshots(urls: readonly string[], supabaseUrl: string): string[] {
  const base = new URL(supabaseUrl);
  const prefix = `/storage/v1/object/public/${SCREENSHOT_BUCKET}/`;
  return urls.filter((url) => {
    if (!URL.canParse(url)) return false;
    const parsed = new URL(url);
    return parsed.origin === base.origin && parsed.pathname.startsWith(prefix) && parsed.pathname.length > prefix.length && parsed.search === "" && parsed.hash === "";
  });
}

export type MergedPr = { readonly number: number; readonly url: string; readonly body: string; readonly mergedAt: string; readonly sha: string };

// The change a guardian revert undid, as its Timeline row has it.
export type RevertedChange = { readonly id: string; readonly title: string; readonly feedback_ids: readonly string[] };

// The "Reverted" Timeline entry for a merged guardian revert. It links the change it undid and keeps that change's
// feedback; the title and summary come from the change's row and fixed text, not from the PR.
export function revertRow(input: { readonly reverted: RevertedChange; readonly pr: Omit<MergedPr, "body">; readonly trustLevel: number }): ChangelogInsert {
  const { reverted, pr } = input;
  return {
    kind: "revert",
    reverts_id: reverted.id,
    title: `Reverted: ${reverted.title}`.slice(0, 200),
    summary: `Errors spiked in production after "${reverted.title}" went live, so the guardian rolled production back and reverted the change.`,
    feedback_ids: [...reverted.feedback_ids],
    pr_number: pr.number,
    pr_url: pr.url,
    commit_sha: pr.sha.toLowerCase(),
    trust_level: input.trustLevel,
    merged_at: pr.mergedAt,
  };
}

// The Timeline entry for a merged evolution PR. Title and feedback come from the issue, which triage wrote and only
// the loop edits; the PR body only adds the change list and the screenshots.
export function changelogRow(input: {
  readonly issue: BuiltIssue;
  readonly pr: MergedPr;
  readonly data: PrData;
  readonly trustLevel: number;
  readonly supabaseUrl: string;
}): ChangelogInsert {
  const { issue, pr } = input;
  return {
    kind: "change",
    title: issue.title.slice(0, 200),
    summary: changelogSummary(issue.userStory, whatChanged(pr.body)),
    feedback_ids: [...issue.feedbackIds],
    pr_number: pr.number,
    pr_url: pr.url,
    commit_sha: pr.sha.toLowerCase(),
    trust_level: input.trustLevel,
    before_screenshot_urls: trustedScreenshots(input.data.before, input.supabaseUrl),
    after_screenshot_urls: trustedScreenshots(input.data.after, input.supabaseUrl),
    merged_at: pr.mergedAt,
  };
}
