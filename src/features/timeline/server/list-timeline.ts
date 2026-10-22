import "server-only";
import { publicSupabase } from "@/shared/supabase/public-client";
import type { Tables } from "@/shared/supabase/types";

export type LinkedFeedback = Pick<Tables<"feedback">, "id" | "body" | "category">;

export type TimelineEntry = Tables<"changelog"> & {
  readonly linkedFeedback: readonly LinkedFeedback[];
};

const TIMELINE_LIMIT = 100;

export async function listTimeline(): Promise<readonly TimelineEntry[]> {
  const supabase = publicSupabase();
  const { data: entries, error } = await supabase
    .from("changelog")
    .select("*")
    .order("merged_at", { ascending: false })
    .limit(TIMELINE_LIMIT);
  if (error) throw new Error(`timeline: failed to load changelog: ${error.message}`);

  const feedbackIds = [...new Set(entries.flatMap((entry) => entry.feedback_ids))];
  const feedbackById = new Map<string, LinkedFeedback>();
  if (feedbackIds.length > 0) {
    const { data: feedback, error: feedbackError } = await supabase
      .from("feedback")
      .select("id, body, category")
      .in("id", feedbackIds);
    if (feedbackError) throw new Error(`timeline: failed to load feedback: ${feedbackError.message}`);
    for (const item of feedback) feedbackById.set(item.id, item);
  }

  return entries.map((entry) => ({
    ...entry,
    linkedFeedback: entry.feedback_ids.flatMap((id) => {
      const item = feedbackById.get(id);
      return item ? [item] : [];
    }),
  }));
}

async function countKind(kind: "change" | "revert"): Promise<number> {
  const { count, error } = await publicSupabase()
    .from("changelog")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind);
  if (error) throw new Error(`timeline: failed to count ${kind} entries: ${error.message}`);
  return count ?? 0;
}

export async function countChanges(): Promise<{ readonly changes: number; readonly reverts: number }> {
  const [changes, reverts] = await Promise.all([countKind("change"), countKind("revert")]);
  return { changes, reverts };
}
