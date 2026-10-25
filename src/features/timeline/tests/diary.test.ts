import { describe, expect, it } from "vitest";
import { diaryHeadline, diaryPortrait, diaryScene, type DiaryScene } from "../lib/diary";

const SCENES: readonly DiaryScene[] = ["blush", "wobble", "blink", "size", "color", "revert", "general"];

describe("diaryScene", () => {
  it("lets a revert win over the words in the title", () => {
    expect(diaryScene("Bigger wobble on poke", "It grew bigger", "revert")).toBe("revert");
  });

  it.each([
    ["The blob blinks", "", "blink"],
    ["A wink", "", "blink"],
    ["One eye", "", "blink"],
    ["Both eyes", "", "blink"],
    ["Sleep mode", "", "blink"],
    ["A short nap", "", "blink"],
    ["Bigger wobble on poke", "easier to notice", "wobble"],
    ["Poke harder", "", "wobble"],
    ["The blob blushes when you feed it", "a warmer colour after each feed", "blush"],
    ["Feeling happy", "", "blush"],
    ["A warm hello", "", "blush"],
    ["Paint the room pink", "", "color"],
    ["New colour", "", "color"],
    ["New color", "", "color"],
    ["A new hue", "", "color"],
    ["Grow a little", "", "size"],
    ["It grows", "", "size"],
    ["Check the size", "", "size"],
    ["One snack", "", "size"],
    ["Time to feed", "", "size"],
    ["Truly massive", "", "size"],
    ["Expand the body", "", "size"],
    ["A bit bigger", "", "size"],
    ["Give the blob a tiny hat", "Just a hat", "general"],
  ] as const)("reads %j / %j as %s", (title, summary, scene) => {
    expect(diaryScene(title, summary, "change")).toBe(scene);
  });
});

describe("diaryHeadline", () => {
  it("keeps a revert title", () => {
    expect(diaryHeadline("Reverted: Bigger wobble on poke", "revert")).toBe("Reverted: Bigger wobble on poke");
  });

  it("speaks as Blobby when the title is about the blob", () => {
    expect(diaryHeadline("The blob blushes when you feed it", "change")).toBe("I blush when you feed me!");
    expect(diaryHeadline("The blob grows", "change")).toBe("I grow!");
    expect(diaryHeadline("The blob sleeps!", "change")).toBe("I sleep!");
    expect(diaryHeadline("The blob turns pink", "change")).toBe("I turn pink!");
  });

  it("keeps a title it cannot say in the first person", () => {
    expect(diaryHeadline("The blob dances tonight", "change")).toBe("The blob dances tonight!");
    expect(diaryHeadline("Bigger wobble on poke", "change")).toBe("Bigger wobble on poke!");
    expect(diaryHeadline("Wow!", "change")).toBe("Wow!");
  });
});

describe("diaryPortrait", () => {
  it("draws a different before and after for every scene", () => {
    for (const scene of SCENES) {
      expect(diaryPortrait(scene, "before")).not.toEqual(diaryPortrait(scene, "after"));
    }
  });

  it("uses the pictures the diary describes", () => {
    expect(diaryPortrait("color", "before").fill).toBe("#2f8f6b");
    expect(diaryPortrait("color", "after")).toMatchObject({ fill: "#e86fa3", look: "plain" });
    expect(diaryPortrait("blink", "after").look).toBe("wink");
    expect(diaryPortrait("wobble", "after").look).toBe("squash");
    expect(diaryPortrait("blush", "after").look).toBe("blush");
    expect(diaryPortrait("revert", "before").look).toBe("squash");
    expect(diaryPortrait("size", "after").scale).toBeGreaterThan(diaryPortrait("size", "before").scale);
  });
});
