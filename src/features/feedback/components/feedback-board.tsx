import "server-only";
import Link from "next/link";
import { categoryFilterNote, parseCategoryFilter } from "../lib/feedback-filter";
import { parseFeedbackSort } from "../lib/feedback-sort";
import { boardTimestamp, listFeedback } from "../server/list-feedback";
import { FeedbackItem } from "./feedback-item";
import { ReportButton } from "./report-button";
import { SortTabs } from "./sort-tabs";
import { VoteButton } from "./vote-button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function FeedbackBoard({ searchParams }: { readonly searchParams: SearchParams }) {
  const params = await searchParams;
  const sort = parseFeedbackSort(params.sort);
  const category = parseCategoryFilter(params.category);
  const items = await listFeedback(sort, category);
  const now = boardTimestamp();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">What people want</h2>
        <SortTabs active={sort} />
      </div>
      {category === undefined ? null : (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span data-testid="feedback-filter-note" className="text-ink-soft">
            {categoryFilterNote(category)}
          </span>
          <Link href={`/feedback?sort=${sort}`} data-testid="feedback-filter-clear" className="font-medium underline underline-offset-2">
            Show all
          </Link>
        </p>
      )}
      {items.length === 0 ? (
        <p data-testid="feedback-empty" className="text-ink-soft">
          No feedback yet. Be the first!
        </p>
      ) : (
        <ul data-testid="feedback-list" data-sort={sort} className="space-y-3">
          {items.map((item) => (
            <FeedbackItem
              key={item.id}
              item={item}
              now={now}
              voteControl={<VoteButton feedbackId={item.id} count={item.vote_count} />}
              reportControl={<ReportButton feedbackId={item.id} />}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
