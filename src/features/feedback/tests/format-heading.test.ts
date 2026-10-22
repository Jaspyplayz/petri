import { describe, expect, it } from "vitest";
import { formatHeading } from "../lib/format-heading";

describe("formatHeading", () => {
  it("trims and collapses whitespace", () => {
    expect(formatHeading("  Feedback   panel ")).toBe("Feedback panel");
  });
});
