import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORTS_TO_HIDE, reportOutcome } from "../lib/feedback-report";

describe("REPORTS_TO_HIDE", () => {
  it("is the count at which the newest migration's report trigger hides an item", () => {
    const migrations = join(import.meta.dirname, "..", "..", "..", "..", "supabase", "migrations");
    const triggers = readdirSync(migrations)
      .sort()
      .map((name) => /function public\.sync_feedback_report_count\(\)[\s\S]*?\$\$;/.exec(readFileSync(join(migrations, name), "utf8"))?.[0])
      .filter((body) => body !== undefined);
    const threshold = /hidden = hidden or report_count \+ 1 >= (\d+)/.exec(triggers.at(-1) ?? "")?.[1];
    expect(Number(threshold)).toBe(REPORTS_TO_HIDE);
  });
});

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
