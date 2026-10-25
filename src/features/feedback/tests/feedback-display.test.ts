import { describe, expect, it } from "vitest";
import { feedbackSortLabel, parseFeedbackSort } from "../lib/feedback-sort";
import {
  feedbackCategoryLabel,
  feedbackLearnedLine,
  feedbackRejectionReason,
  feedbackStatusClasses,
  feedbackStatusLabel,
} from "../lib/feedback-status";

describe("parseFeedbackSort", () => {
  it.each([
    [undefined, "top"],
    ["top", "top"],
    ["new", "new"],
    ["oldest", "top"],
    [["new", "top"], "new"],
    [[], "top"],
  ] as const)("parses %j as %s", (input, expected) => {
    expect(parseFeedbackSort(input)).toBe(expected);
  });

  it("labels each sort", () => {
    expect(feedbackSortLabel("top")).toBe("Top");
    expect(feedbackSortLabel("new")).toBe("Newest");
  });
});

describe("status and category labels", () => {
  it.each(["new", "triaged", "building", "shipped", "rejected"] as const)("labels %s", (status) => {
    expect(feedbackStatusLabel(status)).toMatch(/^[A-Z][a-z]+$/);
    expect(feedbackStatusClasses(status)).not.toBe("");
  });

  it("labels categories", () => {
    expect(feedbackCategoryLabel("idea")).toBe("Idea");
    expect(feedbackCategoryLabel("bug")).toBe("Bug");
  });

  it("says Blobby learned a shipped idea", () => {
    expect(feedbackLearnedLine("shipped")).toBe("Blobby learned this");
    for (const status of ["new", "triaged", "building", "rejected"] as const) {
      expect(feedbackLearnedLine(status)).toBeNull();
    }
  });

  it("gives a rejected idea one gentle reason", () => {
    expect(feedbackRejectionReason("rejected")).toBe(
      "Blobby left this one alone. It was unclear, not safe, or too big for one lesson.",
    );
    for (const status of ["new", "triaged", "building", "shipped"] as const) {
      expect(feedbackRejectionReason(status)).toBeNull();
    }
  });
});
