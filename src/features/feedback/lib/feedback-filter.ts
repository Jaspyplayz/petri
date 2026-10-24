import type { FeedbackCategory } from "./feedback-status";

export const FEEDBACK_CATEGORIES = ["idea", "bug"] as const satisfies readonly FeedbackCategory[];

export function parseCategoryFilter(value: string | readonly string[] | undefined): FeedbackCategory | undefined {
  const candidate = typeof value === "object" ? value[0] : value;
  return FEEDBACK_CATEGORIES.find((option) => option === candidate);
}
