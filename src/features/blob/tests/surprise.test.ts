import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEEN_STORAGE_ITEM,
  currentSurprise,
  isSurprised,
  lastSeenCount,
  noticeEvolved,
  subscribeToSurprise,
} from "../lib/surprise";

describe("lastSeenCount", () => {
  it("reads the stored count", () => {
    expect(lastSeenCount("", "4")).toBe(4);
  });

  it("prefers a pinned ?seen count", () => {
    expect(lastSeenCount("?hour=12&seen=0", "4")).toBe(0);
  });

  it("is null on a first visit", () => {
    expect(lastSeenCount("", null)).toBeNull();
  });

  it.each(["?seen=-1", "?seen=abc", "?seen=", "?seen=1.5"])("ignores %s", (search) => {
    expect(lastSeenCount(search, "3")).toBe(3);
  });

  it("ignores a corrupt stored count", () => {
    expect(lastSeenCount("", "lots")).toBeNull();
  });
});

describe("isSurprised", () => {
  it("is surprised when Blobby evolved since the last visit", () => {
    expect(isSurprised(5, 4)).toBe(true);
  });

  it("is calm when nothing new shipped", () => {
    expect(isSurprised(4, 4)).toBe(false);
    expect(isSurprised(3, 4)).toBe(false);
  });

  it("is calm on a first visit", () => {
    expect(isSurprised(5, null)).toBe(false);
  });
});

function fakeWindow(search: string, stored: Map<string, string>) {
  vi.stubGlobal("window", {
    location: { search },
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
}

describe("noticeEvolved", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surprises once per new count and remembers it", () => {
    const stored = new Map([[SEEN_STORAGE_ITEM, "2"]]);
    fakeWindow("", stored);
    const listener = vi.fn();
    const unsubscribe = subscribeToSurprise(listener);

    noticeEvolved(3);
    expect(currentSurprise()).toEqual({ evolved: 3, surprised: true });
    expect(stored.get(SEEN_STORAGE_ITEM)).toBe("3");
    expect(listener).toHaveBeenCalledTimes(1);

    noticeEvolved(3);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    noticeEvolved(4);
    expect(currentSurprise()).toEqual({ evolved: 4, surprised: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stays calm when storage is unavailable", () => {
    vi.stubGlobal("window", {
      location: { search: "" },
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    noticeEvolved(9);
    expect(currentSurprise()).toEqual({ evolved: 9, surprised: false });
  });
});
