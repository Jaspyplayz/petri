"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SubmitEvent } from "react";
import { track } from "@/shared/lib/track";
import { Button } from "@/shared/ui/button";
import {
  FEEDBACK_MAX_LENGTH,
  charactersLeft,
  feedbackErrorMessage,
  parseFeedbackApiError,
} from "../lib/feedback-input";
import type { FeedbackCategory } from "../lib/feedback-status";

type FormMessage = { readonly tone: "success" | "error"; readonly text: string };

const CATEGORIES: readonly { readonly value: FeedbackCategory; readonly label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "bug", label: "Bug" },
];

export function FeedbackForm() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [pending, startTransition] = useTransition();
  const left = charactersLeft(body);
  const empty = body.trim().length === 0;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (empty || pending) return;
    startTransition(async () => {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, category }),
      });
      if (response.status === 201) {
        setBody("");
        setMessage({ tone: "success", text: "Thanks! Your feedback is on the board." });
        track("feedback", "post");
        router.refresh();
        return;
      }
      const error = parseFeedbackApiError(await response.json().catch(() => null));
      setMessage({ tone: "error", text: feedbackErrorMessage(error) });
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="feedback-form"
      aria-labelledby="feedback-form-heading"
      className="space-y-3 rounded-3xl border border-ink/10 bg-agar-deep/60 p-5"
    >
      <h2 id="feedback-form-heading" className="text-lg font-semibold">
        Share an idea or a bug
      </h2>
      <label htmlFor="feedback-body" className="sr-only">
        Your feedback
      </label>
      <textarea
        id="feedback-body"
        data-testid="feedback-body-input"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setMessage(null);
        }}
        maxLength={FEEDBACK_MAX_LENGTH}
        rows={3}
        placeholder="The blob should…"
        aria-describedby="feedback-char-count"
        className="w-full resize-none rounded-2xl border border-ink/20 bg-agar p-3 text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex gap-3">
          <legend className="sr-only">Category</legend>
          {CATEGORIES.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="category"
                value={option.value}
                checked={category === option.value}
                onChange={() => {
                  setCategory(option.value);
                }}
                data-testid={`feedback-category-${option.value}`}
                className="accent-culture"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-3">
          <span
            id="feedback-char-count"
            data-testid="feedback-char-count"
            className={`text-xs ${left < 20 ? "text-warning" : "text-ink-soft"}`}
          >
            {left} characters left
          </span>
          <Button type="submit" disabled={empty || pending} data-testid="feedback-submit">
            {pending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
      {message ? (
        <p
          data-testid="feedback-form-message"
          data-tone={message.tone}
          role={message.tone === "error" ? "alert" : "status"}
          className={`text-sm ${message.tone === "error" ? "text-warning" : "text-culture-deep"}`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
