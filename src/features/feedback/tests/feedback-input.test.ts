import { describe, expect, it } from "vitest";
import {
  charactersLeft,
  FEEDBACK_MAX_LENGTH,
  feedbackErrorMessage,
  feedbackIdSchema,
  feedbackInputSchema,
  parseFeedbackApiError,
} from "../lib/feedback-input";
import { RATE_LIMITS } from "../lib/rate-limits";

describe("feedbackInputSchema", () => {
  it("trims the body", () => {
    expect(feedbackInputSchema.parse({ body: "  hat please  ", category: "idea" })).toEqual({
      body: "hat please",
      category: "idea",
    });
  });

  it("accepts exactly the maximum length", () => {
    expect(feedbackInputSchema.safeParse({ body: "x".repeat(FEEDBACK_MAX_LENGTH), category: "bug" }).success).toBe(true);
  });

  it.each([
    { body: "", category: "idea" },
    { body: "     ", category: "idea" },
    { body: "x".repeat(FEEDBACK_MAX_LENGTH + 1), category: "idea" },
    { body: "ok", category: "praise" },
    { body: 42, category: "idea" },
    { category: "idea" },
  ])("rejects %j", (input) => {
    expect(feedbackInputSchema.safeParse(input).success).toBe(false);
  });

  it("strips unknown keys such as status or author_hash", () => {
    const parsed = feedbackInputSchema.parse({ body: "hi", category: "idea", status: "shipped", author_hash: "x" });
    expect(parsed).toEqual({ body: "hi", category: "idea" });
  });
});

describe("feedbackIdSchema", () => {
  it("accepts uuids only", () => {
    expect(feedbackIdSchema.safeParse("00000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(feedbackIdSchema.safeParse("1; drop table feedback").success).toBe(false);
  });
});

describe("charactersLeft", () => {
  it("counts down from the maximum ignoring outer whitespace", () => {
    expect(charactersLeft("")).toBe(FEEDBACK_MAX_LENGTH);
    expect(charactersLeft("  abc  ")).toBe(FEEDBACK_MAX_LENGTH - 3);
  });
});

describe("API errors", () => {
  it("parses known error codes and falls back to unavailable", () => {
    expect(parseFeedbackApiError({ error: "rate_limited" })).toBe("rate_limited");
    expect(parseFeedbackApiError({ error: "weird" })).toBe("unavailable");
    expect(parseFeedbackApiError(null)).toBe("unavailable");
  });

  it("parses the kill-switch codes and explains each", () => {
    expect(parseFeedbackApiError({ error: "feedback_closed" })).toBe("feedback_closed");
    expect(parseFeedbackApiError({ error: "read_only" })).toBe("read_only");
    expect(feedbackErrorMessage("feedback_closed")).toBe("Posting is closed for now. You can still vote.");
    expect(feedbackErrorMessage("read_only")).toBe("Petri is read-only for now. Try again later.");
  });

  it.each(["invalid", "too_large", "rate_limited", "not_found", "unavailable"] as const)(
    "has a message for %s",
    (code) => {
      expect(feedbackErrorMessage(code).length).toBeGreaterThan(0);
    },
  );
});

describe("rate limits", () => {
  it("matches the spec: 5 posts, 30 votes and 10 reports per hour", () => {
    expect(RATE_LIMITS.post).toEqual({ limit: 5, windowSeconds: 3600 });
    expect(RATE_LIMITS.vote).toEqual({ limit: 30, windowSeconds: 3600 });
    expect(RATE_LIMITS.report).toEqual({ limit: 10, windowSeconds: 3600 });
  });
});
