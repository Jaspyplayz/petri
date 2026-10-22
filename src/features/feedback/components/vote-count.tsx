export function VoteCount({ count }: { readonly count: number }) {
  return (
    <div className="flex w-12 flex-col items-center justify-center">
      <span data-testid="feedback-vote-count" className="text-lg font-bold">
        {count}
      </span>
      <span className="text-xs text-ink-soft">{count === 1 ? "vote" : "votes"}</span>
    </div>
  );
}
