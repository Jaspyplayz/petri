import { describe, expect, it } from "vitest";
import { localHour, timeMood, timeMoodLabel } from "../lib/time-mood";

describe("timeMood", () => {
  it.each([
    [21, "awake"],
    [22, "sleepy"],
    [23, "sleepy"],
    [0, "sleepy"],
    [5, "sleepy"],
    [6, "awake"],
    [12, "awake"],
  ] as const)("at %s:00 Blobby is %s", (hour, mood) => {
    expect(timeMood(hour)).toBe(mood);
  });
});

describe("timeMoodLabel", () => {
  it("names each mood", () => {
    expect(timeMoodLabel("sleepy")).toBe("Sleepy");
    expect(timeMoodLabel("awake")).toBe("Awake");
  });
});

describe("localHour", () => {
  const noon = new Date(2026, 0, 1, 12, 30);

  it("reads the browser clock", () => {
    expect(localHour("", noon)).toBe(12);
  });

  it("uses a pinned hour from the query", () => {
    expect(localHour("?hour=23", noon)).toBe(23);
    expect(localHour("?hour=0", noon)).toBe(0);
  });

  it.each(["?hour=24", "?hour=-1", "?hour=abc", "?hour=", "?hour=1.5"])("ignores %s", (search) => {
    expect(localHour(search, noon)).toBe(12);
  });
});
