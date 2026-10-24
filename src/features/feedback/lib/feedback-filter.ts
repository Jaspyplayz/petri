import type { FeedbackCategory } from "./feedback-status";

export const FEEDBACK_CATEGORIES = ["idea", "bug"] as const satisfies readonly FeedbackCategory[];

export function parseCategoryFilter(value: string | readonly string[] | undefined): FeedbackCategory | undefined {
  const candidate = typeof value === "object" ? value[0] : value;
  if (candidate === undefined || candidate === "") return undefined;
  const category = FEEDBACK_CATEGORIES.find((option) => option === candidate);
  if (category === undefined) throw new Error(`feedback: unknown category filter "${candidate}"`);
  return category;
}

export function categoryFilterNote(category: FeedbackCategory): string {
  switch (category) {
    case "idea":
      return "Showing ideas only";
    case "bug":
      return "Showing bugs only";
  }
}
