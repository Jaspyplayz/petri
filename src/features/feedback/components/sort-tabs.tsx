import Link from "next/link";
import { FEEDBACK_SORTS, feedbackSortLabel, type FeedbackSort } from "../lib/feedback-sort";

export function SortTabs({ active }: { readonly active: FeedbackSort }) {
  return (
    <nav aria-label="Sort feedback" className="flex gap-1">
      {FEEDBACK_SORTS.map((sort) => (
        <Link
          key={sort}
          href={`/feedback?sort=${sort}`}
          data-testid={`feedback-sort-${sort}`}
          aria-current={sort === active ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-sm font-bold ${sort === active ? "bg-lesson text-lesson-ink" : "text-ink-soft hover:bg-card"}`}
        >
          {feedbackSortLabel(sort)}
        </Link>
      ))}
    </nav>
  );
}
