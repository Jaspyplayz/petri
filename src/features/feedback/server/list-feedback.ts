import "server-only";
import { publicSupabase } from "@/shared/supabase/public-client";
import type { Tables } from "@/shared/supabase/types";
import type { FeedbackSort } from "../lib/feedback-sort";
import type { FeedbackCategory } from "../lib/feedback-status";

export type FeedbackItem = Pick<
  Tables<"feedback">,
  "id" | "body" | "category" | "status" | "vote_count" | "issue_url" | "issue_number" | "pr_url" | "created_at"
>;

const FEEDBACK_LIMIT = 100;

export function boardTimestamp(): number {
  return Date.now();
}

export async function listFeedback(sort: FeedbackSort, category?: FeedbackCategory): Promise<readonly FeedbackItem[]> {
  let query = publicSupabase()
    .from("feedback")
    .select("id, body, category, status, vote_count, issue_url, issue_number, pr_url, created_at")
    .limit(FEEDBACK_LIMIT);
  if (category !== undefined) query = query.eq("category", category);
  query =
    sort === "top"
      ? query.order("vote_count", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`feedback: failed to load board: ${error.message}`);
  return data;
}
