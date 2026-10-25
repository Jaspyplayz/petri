import type { Enums } from "@/shared/supabase/types";

export type FeedbackStatus = Enums<"feedback_status">;
export type FeedbackCategory = Enums<"feedback_category">;

export function feedbackStatusLabel(status: FeedbackStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "triaged":
      return "Triaged";
    case "building":
      return "Building";
    case "shipped":
      return "Shipped";
    case "rejected":
      return "Rejected";
  }
}

export function feedbackStatusClasses(status: FeedbackStatus): string {
  switch (status) {
    case "new":
      return "bg-agar text-ink-soft border border-ink/15";
    case "triaged":
      return "bg-spore/25 text-ink";
    case "building":
      return "bg-spore text-ink";
    case "shipped":
      return "bg-feed text-feed-ink";
    case "rejected":
      return "bg-ink/10 text-ink line-through";
  }
}

export function feedbackCategoryLabel(category: FeedbackCategory): string {
  switch (category) {
    case "idea":
      return "Idea";
    case "bug":
      return "Bug";
  }
}

export function feedbackLearnedLine(status: FeedbackStatus): string | null {
  return status === "shipped" ? "Blobby learned this" : null;
}

export function feedbackRejectionReason(status: FeedbackStatus): string | null {
  return status === "rejected" ? "Blobby left this one alone. It was unclear, not safe, or too big for one lesson." : null;
}
