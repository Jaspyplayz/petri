"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { track } from "@/shared/lib/track";
import { feedbackErrorMessage, parseFeedbackApiError } from "../lib/feedback-input";

type VoteState =
  | { readonly kind: "idle" }
  | { readonly kind: "voted" }
  | { readonly kind: "alreadyVoted" }
  | { readonly kind: "error"; readonly text: string };

export function VoteButton({ feedbackId, count }: { readonly feedbackId: string; readonly count: number }) {
  const router = useRouter();
  const [state, setState] = useState<VoteState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const voted = state.kind === "voted" || state.kind === "alreadyVoted";

  const handleVote = () => {
    if (voted || pending) return;
    startTransition(async () => {
      const response = await fetch(`/api/feedback/${feedbackId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status === 201) {
        setState({ kind: "voted" });
        track("feedback", "vote");
        router.refresh();
        return;
      }
      if (response.ok) {
        setState({ kind: "alreadyVoted" });
        return;
      }
      const error = parseFeedbackApiError(await response.json().catch(() => null));
      setState({ kind: "error", text: feedbackErrorMessage(error) });
    });
  };

  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleVote}
        disabled={pending}
        aria-pressed={voted}
        aria-label={voted ? "Voted" : "Upvote"}
        data-testid="feedback-vote-button"
        className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition-colors ${voted ? "border-culture-deep bg-culture-deep text-agar" : "border-ink/20 hover:border-culture hover:text-culture-deep"}`}
      >
        <span aria-hidden="true">▲</span>
      </button>
      <span data-testid="feedback-vote-count" className="text-sm font-bold">
        {count}
      </span>
      {state.kind === "alreadyVoted" ? (
        <span data-testid="feedback-vote-note" role="status" className="text-center text-[11px] leading-tight text-ink-soft">
          Already counted
        </span>
      ) : null}
      {state.kind === "error" ? (
        <span data-testid="feedback-vote-error" role="alert" className="text-center text-[11px] leading-tight text-warning">
          {state.text}
        </span>
      ) : null}
    </div>
  );
}
