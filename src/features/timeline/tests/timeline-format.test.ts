import { describe, expect, it } from "vitest";
import {
  evolvedLine,
  formatMergedAt,
  liveChangeCount,
  revertDiaryLine,
  shortSha,
  trustLevelLabel,
} from "../lib/timeline-format";

describe("shortSha", () => {
  it("keeps the first 7 characters", () => {
    expect(shortSha("a1b2c3d4e5f6")).toBe("a1b2c3d");
  });

  it("passes null through", () => {
    expect(shortSha(null)).toBeNull();
  });
});

describe("liveChangeCount", () => {
  it("subtracts reverted changes and never goes negative", () => {
    expect(liveChangeCount(2, 1)).toBe(1);
    expect(liveChangeCount(0, 0)).toBe(0);
    expect(liveChangeCount(1, 3)).toBe(0);
  });
});

describe("evolvedLine", () => {
  it("counts the changes that are still in effect", () => {
    expect(evolvedLine(0)).toBe("Evolved 0 times from visitor ideas");
    expect(evolvedLine(1)).toBe("Evolved 1 time from visitor ideas");
    expect(evolvedLine(12)).toBe("Evolved 12 times from visitor ideas");
  });
});

describe("revertDiaryLine", () => {
  it("says a revert undid a change, in plain words", () => {
    expect(revertDiaryLine()).toBe("This undid a change that hurt Blobby.");
  });
});

describe("formatMergedAt", () => {
  it("formats in UTC so server and tests agree", () => {
    expect(formatMergedAt("2026-10-21T14:05:00Z")).toBe("Oct 21, 2026, 02:05 PM UTC");
  });
});

describe("trustLevelLabel", () => {
  it("names the level", () => {
    expect(trustLevelLabel(1)).toBe("Trust level 1");
  });
});
