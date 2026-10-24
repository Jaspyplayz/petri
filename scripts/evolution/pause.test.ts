import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STOPPABLE_WORKFLOWS, resumeBlock, runsToCancel } from "./pause";

const now = new Date("2026-10-24T12:00:00Z");

describe("runsToCancel", () => {
  it("cancels only runs that haven't finished, once each", () => {
    expect(
      runsToCancel([
        { databaseId: 3, status: "in_progress" },
        { databaseId: 1, status: "queued" },
        { databaseId: 2, status: "completed" },
        { databaseId: 3, status: "in_progress" },
        { databaseId: 4, status: "waiting" },
      ]),
    ).toEqual([1, 3, 4]);
  });
});

describe("resumeBlock", () => {
  it("lets a resume through when main has no PAUSED file or its pause ended", () => {
    expect(resumeBlock(undefined, now)).toBeUndefined();
    expect(resumeBlock(JSON.stringify({ until: "2026-10-24T11:00:00Z" }), now)).toBeUndefined();
  });

  it("blocks while the PAUSED file is active, unreadable or open-ended", () => {
    expect(resumeBlock(JSON.stringify({ until: "2026-10-25T00:00:00Z" }), now)).toMatch(/paused until .*human PR/);
    expect(resumeBlock(JSON.stringify({ until: null }), now)).toMatch(/until a human resumes/);
    expect(resumeBlock("not json", now)).toMatch(/isn't valid JSON/);
  });
});

describe("STOPPABLE_WORKFLOWS", () => {
  it("names workflow files that exist", () => {
    const files = readdirSync(join(import.meta.dirname, "..", "..", ".github", "workflows"));
    for (const workflow of STOPPABLE_WORKFLOWS) expect(files).toContain(workflow);
  });
});
