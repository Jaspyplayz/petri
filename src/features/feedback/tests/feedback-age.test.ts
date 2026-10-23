import { describe, expect, it } from "vitest";
import { feedbackAgeLabel } from "../lib/feedback-age";

const now = Date.parse("2026-06-15T12:00:00Z");
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe("feedbackAgeLabel", () => {
  it.each([
    [0, "just now"],
    [59, "just now"],
    [60, "1 minute ago"],
    [300, "5 minutes ago"],
    [3600, "1 hour ago"],
    [3 * 86400, "3 days ago"],
    [60 * 86400, "2 months ago"],
    [800 * 86400, "2 years ago"],
    [-30, "just now"],
  ])("labels %d seconds as %s", (seconds, expected) => {
    expect(feedbackAgeLabel(ago(seconds), now)).toBe(expected);
  });

  it("returns an empty label for an invalid date", () => {
    expect(feedbackAgeLabel("nope", now)).toBe("");
  });
});
