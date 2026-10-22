import { describe, expect, it } from "vitest";
import { formatHeading } from "../lib/format-heading";

describe("formatHeading", () => {
  it("trims and collapses whitespace", () => {
    expect(formatHeading("  Analytics   panel ")).toBe("Analytics panel");
  });
});
