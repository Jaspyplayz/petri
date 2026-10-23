import "server-only";
import { parseFeedbackSort } from "../lib/feedback-sort";
import { boardTimestamp, listFeedback } from "../server/list-feedback";
import { FeedbackItem } from "./feedback-item";
import { SortTabs } from "./sort-tabs";
import { VoteButton } from "./vote-button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function FeedbackBoard({ searchParams }: { readonly searchParams: SearchParams }) {
  const sort = parseFeedbackSort((await searchParams).sort);
  const items = await listFeedback(sort);
  const now = boardTimestamp();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">What people want</h2>
        <SortTabs active={sort} />
      </div>
      {items.length === 0 ? (
        <p data-testid="feedback-empty" className="text-ink-soft">
          No feedback yet. Be the first!
        </p>
      ) : (
        <ul data-testid="feedback-list" data-sort={sort} className="space-y-3">
          {items.map((item) => (
            <FeedbackItem key={item.id} item={item} now={now} voteControl={<VoteButton feedbackId={item.id} count={item.vote_count} />} />
          ))}
        </ul>
      )}
    </div>
  );
}
