import { describe, expect, it } from "vitest";
import { colorPokePose, colorSnackMood,localHour, shownMood, timeMood, timeMoodLabel } from "../lib/time-mood";

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
    expect(timeMoodLabel("happy")).toBe("Happy");
    expect(timeMoodLabel("surprised")).toBe("Surprised");
    expect(timeMoodLabel("sad")).toBe("Sad");
  });
});

describe("colorSnackMood", () => {
  it("makes a purple Blobby sad after a snack and every other colour happy", () => {
    expect(colorSnackMood("purple")).toBe("sad");
    expect(colorSnackMood("green")).toBe("happy");
    expect(colorSnackMood("pink")).toBe("happy");
  });
});

describe("colorPokePose", () => {
  it("makes a purple Blobby shrink when poked and every other colour wobble", () => {
    expect(colorPokePose("purple")).toBe("shrink");
    expect(colorPokePose("green")).toBe("wobble");
    expect(colorPokePose("pink")).toBe("wobble");
  });
});

describe("shownMood", () => {
  it("is happy right after a snack in the daytime", () => {
    expect(shownMood("awake", true)).toBe("happy");
  });

  it("stays sleepy at night, even after a snack", () => {
    expect(shownMood("sleepy", true)).toBe("sleepy");
  });

  it("is surprised after evolving, day or night, until a daytime snack", () => {
    expect(shownMood("awake", false, true)).toBe("surprised");
    expect(shownMood("sleepy", true, true)).toBe("surprised");
    expect(shownMood("awake", true, true)).toBe("happy");
  });

  it("is sad right after a daytime snack when its colour makes it sad", () => {
    expect(shownMood("awake", true, false, "sad")).toBe("sad");
    expect(shownMood("awake", true, true, "sad")).toBe("sad");
    expect(shownMood("sleepy", true, false, "sad")).toBe("sleepy");
    expect(shownMood("awake", false, false, "sad")).toBe("awake");
  });

  it("follows the clock when Blobby wasn't just fed", () => {
    expect(shownMood("awake", false)).toBe("awake");
    expect(shownMood("sleepy", false)).toBe("sleepy");
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
