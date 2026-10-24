import { describe, expect, it } from "vitest";
import { hiddenByReports, renderHiddenFeedback, type HiddenItem, type ReportedItemRow } from "./hidden-feedback";
import { windowStart } from "./usage";

const since = windowStart(new Date("2026-11-08T12:00:00Z"));

function item(id: string, reportedAt: readonly string[], fields: Partial<Pick<ReportedItemRow, "category" | "hidden">> = {}): ReportedItemRow {
  return { id, category: "idea", hidden: true, ...fields, feedback_reports: reportedAt.map((created_at) => ({ created_at })) };
}

const thisWeek = item("a1", ["2026-10-30T08:00:00+00:00", "2026-11-02T09:00:00+00:00", "2026-11-03T10:30:00.123456+00:00"], { category: "bug" });
const listed: HiddenItem = { id: "a1", category: "bug", reportCount: 3, hiddenAt: new Date("2026-11-03T10:30:00.123Z") };

describe("hiddenByReports", () => {
  it("lists an item whose 3rd report came in the last 7 days", () => {
    expect(hiddenByReports([thisWeek], since)).toEqual([listed]);
  });

  it("counts a 3rd report at the window's first instant as in the window", () => {
    const atStart = item("b1", ["2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z", "2026-11-01T12:00:00Z"]);
    expect(hiddenByReports([atStart], since)).toEqual([{ id: "b1", category: "idea", reportCount: 3, hiddenAt: new Date("2026-11-01T12:00:00Z") }]);
  });

  it("leaves out an item hidden before the window", () => {
    const lastWeek = item("c1", ["2026-10-20T00:00:00Z", "2026-10-25T00:00:00Z", "2026-11-01T11:59:59Z"]);
    expect(hiddenByReports([lastWeek, thisWeek], since)).toEqual([listed]);
  });

  it("leaves out an item a maintainer unhid", () => {
    expect(hiddenByReports([{ ...thisWeek, id: "d1", hidden: false }, thisWeek], since)).toEqual([listed]);
  });

  it("leaves out an item whose 3rd report was before the window, even with a 4th in it", () => {
    const fourth = item("e1", ["2026-10-20T00:00:00Z", "2026-10-21T00:00:00Z", "2026-10-22T00:00:00Z", "2026-11-05T00:00:00Z"]);
    expect(hiddenByReports([fourth, thisWeek], since)).toEqual([listed]);
  });

  it("leaves out an item hidden with fewer than 3 reports, since reports didn't hide it", () => {
    expect(hiddenByReports([item("f1", ["2026-11-04T00:00:00Z", "2026-11-05T00:00:00Z"]), thisWeek], since)).toEqual([listed]);
  });

  it("takes the 3rd report by time whatever order the reports arrive in, and counts every report", () => {
    const shuffled = item("g1", ["2026-11-06T00:00:00Z", "2026-10-01T00:00:00Z", "2026-11-07T00:00:00Z", "2026-10-02T00:00:00Z"]);
    expect(hiddenByReports([shuffled], since)).toEqual([{ id: "g1", category: "idea", reportCount: 4, hiddenAt: new Date("2026-11-06T00:00:00Z") }]);
  });

  it("sorts by the time each item was hidden, oldest first, then by id", () => {
    const late = item("h2", ["2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z", "2026-11-07T00:00:00Z"]);
    const early = item("h3", ["2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z"]);
    const tie = item("h1", ["2026-11-05T00:00:00Z", "2026-11-06T00:00:00Z", "2026-11-07T00:00:00Z"]);
    expect(hiddenByReports([late, early, tie], since).map((hidden) => hidden.id)).toEqual(["h3", "h1", "h2"]);
  });
});

describe("renderHiddenFeedback", () => {
  it("lists each item's id, category, report count and hidden time, and how to read or unhide one", () => {
    const text = renderHiddenFeedback([listed, { id: "b1", category: "idea", reportCount: 5, hiddenAt: new Date("2026-11-07T23:59:30Z") }], since);
    expect(text).toContain("## Feedback hidden by reports since 2026-11-01 12:00 UTC");
    expect(text).toContain("2 items reached 3 reports");
    expect(text).toContain("| `a1` | bug | 3 | 2026-11-03 10:30 |");
    expect(text).toContain("| `b1` | idea | 5 | 2026-11-07 23:59 |");
    expect(text).toContain("select body from public.feedback where id = '<id>';");
    expect(text).toContain("delete from public.feedback_reports where feedback_id = '<id>';");
    expect(text).toContain("update public.feedback set hidden = false where id = '<id>';");
    expect(renderHiddenFeedback([listed], since)).toContain("1 item reached 3 reports");
  });

  it("keeps a mass hide short enough for an issue body, and counts the items it doesn't list", () => {
    const many = Array.from({ length: 1000 }, (_, index) => ({ ...listed, id: crypto.randomUUID(), hiddenAt: new Date(since.getTime() + index * 60_000) }));
    const text = renderHiddenFeedback(many, since);
    const rows = text.match(/^\| `[0-9a-f-]{36}` \|/gm) ?? [];
    const unlisted = Number(/^(\d+) more aren't listed\./m.exec(text)?.[1]);
    expect(text).toContain("1000 items reached 3 reports");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length + unlisted).toBe(1000);
    expect(text).toContain(`| \`${many[0]?.id ?? ""}\` |`);
    expect(text.length).toBeLessThan(10_000);
  });

  it("renders an empty week as one line under the heading", () => {
    expect(renderHiddenFeedback([], since)).toBe("## Feedback hidden by reports since 2026-11-01 12:00 UTC\n\nNo items were hidden by reports.");
  });
});
