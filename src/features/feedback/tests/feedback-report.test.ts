import { describe, expect, it } from "vitest";
import { reportOutcome } from "../lib/feedback-report";

describe("reportOutcome", () => {
  it("maps the insert's result to what the reporter sees", () => {
    expect(reportOutcome(undefined)).toBe("reported");
    expect(reportOutcome("23505")).toBe("already_reported");
    expect(reportOutcome("23503")).toBe("not_found");
  });

  it("leaves any other database error to the handler", () => {
    expect(reportOutcome("42501")).toBeUndefined();
    expect(reportOutcome("")).toBeUndefined();
  });
});
