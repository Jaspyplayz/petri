import { describe, expect, it } from "vitest";
import { categoryFilterNote, parseCategoryFilter } from "../lib/feedback-filter";

describe("parseCategoryFilter", () => {
  it("returns the category the URL names", () => {
    expect(parseCategoryFilter("bug")).toBe("bug");
    expect(parseCategoryFilter("idea")).toBe("idea");
  });

  it("uses the first value when the parameter repeats", () => {
    expect(parseCategoryFilter(["idea", "bug"])).toBe("idea");
  });

  it("means no filter when the parameter is missing or empty", () => {
    expect(parseCategoryFilter(undefined)).toBeUndefined();
    expect(parseCategoryFilter("")).toBeUndefined();
  });
});

describe("categoryFilterNote", () => {
  it("names the category the board shows", () => {
    expect(categoryFilterNote("bug")).toBe("Showing bugs only");
    expect(categoryFilterNote("idea")).toBe("Showing ideas only");
  });
});
