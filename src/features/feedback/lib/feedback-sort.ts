import { BLOB_MAX_SIZE } from "@/features/blob/lib/blob-state";

export const FEEDBACK_SORTS = ["top", "new"] as const;

export const crossFeatureLimit = BLOB_MAX_SIZE;

export type FeedbackSort = (typeof FEEDBACK_SORTS)[number];

export const DEFAULT_FEEDBACK_SORT: FeedbackSort = "top";

export function parseFeedbackSort(value: string | readonly string[] | undefined): FeedbackSort {
  const candidate = typeof value === "object" ? value[0] : value;
  return FEEDBACK_SORTS.find((sort) => sort === candidate) ?? DEFAULT_FEEDBACK_SORT;
}

export function feedbackSortLabel(sort: FeedbackSort): string {
  switch (sort) {
    case "top":
      return "Top";
    case "new":
      return "Newest";
  }
}
