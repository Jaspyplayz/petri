"use client";

import { useState, useTransition } from "react";
import { track } from "@/shared/lib/track";
import { feedbackErrorMessage, parseFeedbackApiError } from "../lib/feedback-input";
import { REPORTS_TO_HIDE } from "../lib/feedback-report";

type ReportState =
  | { readonly kind: "idle" }
  | { readonly kind: "confirming" }
  | { readonly kind: "done"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

export function ReportButton({ feedbackId }: { readonly feedbackId: string }) {
  const [state, setState] = useState<ReportState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const report = () => {
    startTransition(async () => {
      const response = await fetch(`/api/feedback/${feedbackId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status === 201) {
        setState({ kind: "done", text: "Reported. Thanks." });
        track("feedback", "report");
        return;
      }
      if (response.ok) {
        setState({ kind: "done", text: "Already reported" });
        return;
      }
      const error = parseFeedbackApiError(await response.json().catch(() => null));
      setState({ kind: "error", text: feedbackErrorMessage(error) });
    });
  };

  const handleClick = () => {
    if (pending) return;
    if (state.kind === "confirming") report();
    else setState({ kind: "confirming" });
  };

  if (state.kind === "done") {
    return (
      <span data-testid="feedback-report-note" role="status" className="ml-auto text-ink-soft">
        {state.text}
      </span>
    );
  }

  const confirming = state.kind === "confirming";
  return (
    <span className="ml-auto flex flex-wrap items-center gap-2">
      {state.kind === "error" ? (
        <span data-testid="feedback-report-error" role="alert" className="text-warning">
          {state.text}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-describedby={confirming ? `report-help-${feedbackId}` : undefined}
        data-testid="feedback-report-button"
        className={confirming ? "font-semibold text-warning underline" : "text-ink-soft underline-offset-2 hover:underline"}
      >
        {confirming ? "Confirm report" : "Report"}
      </button>
      {confirming ? (
        <>
          <span id={`report-help-${feedbackId}`} className="text-ink-soft">
            Hidden after {REPORTS_TO_HIDE} reports
          </span>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "idle" });
            }}
            data-testid="feedback-report-cancel"
            className="text-ink-soft underline"
          >
            Cancel
          </button>
        </>
      ) : null}
    </span>
  );
}
