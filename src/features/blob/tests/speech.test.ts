import { describe, expect, it } from "vitest";
import { SPEECH_MS, speechLine } from "../lib/speech";

describe("speechLine", () => {
  it("says it is getting bigger after a snack", () => {
    expect(speechLine("feed")).toContain("I am getting bigger");
  });

  it("says a poke tickles", () => {
    expect(speechLine("poke")).toContain("tickles");
  });

  it("shows each line for a few seconds", () => {
    expect(SPEECH_MS).toBeGreaterThanOrEqual(2000);
  });
});
