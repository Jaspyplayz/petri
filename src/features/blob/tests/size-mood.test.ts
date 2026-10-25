import { describe, expect, it } from "vitest";
import { initialBlobState } from "../lib/blob-state";
import { sizeMood, snackMood } from "../lib/size-mood";

describe("sizeMood", () => {
  it.each([
    [1, "Cozy!"],
    [1.04, "Cozy!"],
    [1.05, "Growing!"],
    [1.29, "Growing!"],
    [1.3, "Plump!"],
    [1.59, "Plump!"],
    [1.6, "Huge!"],
    [1.99, "Huge!"],
    [2, "MASSIVE!"],
  ] as const)("calls size %s %s", (size, word) => {
    expect(sizeMood({ ...initialBlobState, size })).toBe(word);
  });
});

describe("snackMood", () => {
  it("stays quiet until the first snack", () => {
    expect(snackMood(0)).toBeNull();
  });

  it("cheers once a snack has landed", () => {
    expect(snackMood(1)).toBe("Yummy!");
    expect(snackMood(5)).toBe("Yummy!");
  });
});
