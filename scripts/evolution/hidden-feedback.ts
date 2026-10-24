import { REPORTS_TO_HIDE } from "../../src/features/feedback/lib/feedback-report";
import type { Database } from "../../src/shared/supabase/database.types";

type Category = Database["public"]["Enums"]["feedback_category"];

export type ReportedItemRow = {
  readonly id: string;
  readonly category: Category;
  readonly hidden: boolean;
  readonly feedback_reports: readonly { readonly created_at: string }[];
};

export type HiddenItem = { readonly id: string; readonly category: Category; readonly reportCount: number; readonly hiddenAt: Date };

// A GitHub issue body holds 65,536 characters, and a mass hide is when this list matters most.
const MAX_LISTED = 50;

export function hiddenByReports(rows: readonly ReportedItemRow[], since: Date): HiddenItem[] {
  return rows
    .flatMap((row) => {
      const reportedAt = row.feedback_reports.map((report) => new Date(report.created_at)).sort((a, b) => a.getTime() - b.getTime());
      const hiddenAt = reportedAt[REPORTS_TO_HIDE - 1];
      return row.hidden && hiddenAt && hiddenAt.getTime() >= since.getTime() ? [{ id: row.id, category: row.category, reportCount: reportedAt.length, hiddenAt }] : [];
    })
    .sort((a, b) => a.hiddenAt.getTime() - b.hiddenAt.getTime() || a.id.localeCompare(b.id));
}

function minute(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function renderHiddenFeedback(items: readonly HiddenItem[], since: Date): string {
  const heading = `## Feedback hidden by reports since ${minute(since)} UTC`;
  if (items.length === 0) return `${heading}\n\nNo items were hidden by reports.`;
  const listed = items.slice(0, MAX_LISTED);
  return [
    heading,
    "",
    `${String(items.length)} ${items.length === 1 ? "item" : "items"} reached ${String(REPORTS_TO_HIDE)} reports, which took them off the board and out of triage.`,
    "",
    "| Item | Category | Reports | Hidden at (UTC) |",
    "|---|---|---|---|",
    ...listed.map((item) => `| \`${item.id}\` | ${item.category} | ${String(item.reportCount)} | ${minute(item.hiddenAt)} |`),
    ...(items.length > listed.length ? ["", `${String(items.length - listed.length)} more aren't listed.`] : []),
    "",
    "This issue is public, so it shows no feedback text. To read an item, or to unhide one, run these in Supabase's SQL editor with its id. Delete its reports before you set `hidden = false`, or the next report hides it again.",
    "",
    "```sql",
    "select body from public.feedback where id = '<id>';",
    "delete from public.feedback_reports where feedback_id = '<id>';",
    "update public.feedback set hidden = false where id = '<id>';",
    "```",
  ].join("\n");
}
