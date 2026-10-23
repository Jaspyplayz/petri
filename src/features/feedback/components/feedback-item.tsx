import type { ReactNode } from "react";
import { feedbackAgeLabel } from "../lib/feedback-age";
import { feedbackCategoryLabel, feedbackStatusClasses, feedbackStatusLabel } from "../lib/feedback-status";
import type { FeedbackItem as Item } from "../server/list-feedback";

export function FeedbackItem({
  item,
  voteControl,
  now,
}: {
  readonly item: Item;
  readonly voteControl: ReactNode;
  readonly now: number;
}) {
  return (
    <li
      data-testid="feedback-item"
      data-feedback-id={item.id}
      className="flex gap-4 rounded-3xl border border-ink/10 bg-agar-deep/60 p-4"
    >
      {voteControl}
      <div className="min-w-0 flex-1 space-y-2">
        <p data-testid="feedback-item-body" className="break-words">
          {item.body}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-ink/15 px-2 py-0.5 text-ink-soft">
            {feedbackCategoryLabel(item.category)}
          </span>
          <span
            data-testid="feedback-item-status"
            className={`rounded-full px-2 py-0.5 font-semibold ${feedbackStatusClasses(item.status)}`}
          >
            {feedbackStatusLabel(item.status)}
          </span>
          <time data-testid="feedback-item-age" dateTime={item.created_at} className="text-ink-soft">
            {feedbackAgeLabel(item.created_at, now)}
          </time>
          {item.issue_url && item.issue_number ? (
            <a href={item.issue_url} className="text-culture-deep underline" data-testid="feedback-item-issue-link">
              Issue #{item.issue_number}
            </a>
          ) : null}
          {item.pr_url ? (
            <a href={item.pr_url} className="text-culture-deep underline" data-testid="feedback-item-pr-link">
              Pull request
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
