import { expect, it } from "vitest";
import { parseCategoryFilter } from "../lib/feedback-filter";

it("reads a known ?category", () => {
  expect(parseCategoryFilter("bug")).toBe("bug");
  expect(parseCategoryFilter(["idea", "bug"])).toBe("idea");
});

it("an unknown, empty or missing ?category means no filter", () => {
  expect(parseCategoryFilter("guardian-test-a")).toBeUndefined();
  expect(parseCategoryFilter("")).toBeUndefined();
  expect(parseCategoryFilter(undefined)).toBeUndefined();
});
