import { describe, expect, it } from "vitest";
import { DEFAULT_APP_FLAGS, blockedBy, createFlagCache, parseAppFlags, postingOpen, type AppFlags } from "./app-flags";

describe("parseAppFlags", () => {
  it("reads both flags from their rows", () => {
    expect(parseAppFlags([{ key: "feedback_open", value: false }, { key: "read_only_mode", value: true }])).toEqual({
      feedbackOpen: false,
      readOnly: true,
    });
  });

  it("keeps the defaults for a missing row or a value that isn't a boolean", () => {
    expect(parseAppFlags([])).toEqual(DEFAULT_APP_FLAGS);
    expect(parseAppFlags([{ key: "feedback_open", value: "false" }, { key: "read_only_mode", value: null }])).toEqual(DEFAULT_APP_FLAGS);
  });
});

describe("blockedBy", () => {
  const open: AppFlags = { feedbackOpen: true, readOnly: false };

  it("blocks nothing when posting is open and the app isn't read-only", () => {
    for (const action of ["post", "vote", "report", "event"] as const) expect(blockedBy(open, action)).toBeUndefined();
    expect(postingOpen(open)).toBe(true);
  });

  it("closes only posting when feedback is closed", () => {
    const closed = { ...open, feedbackOpen: false };
    expect(blockedBy(closed, "post")).toBe("feedback_closed");
    expect(blockedBy(closed, "vote")).toBeUndefined();
    expect(blockedBy(closed, "report")).toBeUndefined();
    expect(postingOpen(closed)).toBe(false);
  });

  it("closes every write in read-only mode", () => {
    const readOnly = { ...open, readOnly: true };
    for (const action of ["post", "vote", "report", "event"] as const) expect(blockedBy(readOnly, action)).toBe("read_only");
    expect(postingOpen(readOnly)).toBe(false);
  });
});

describe("createFlagCache", () => {
  const closed: AppFlags = { feedbackOpen: false, readOnly: false };

  it("loads once per TTL and again after it", async () => {
    let time = 0;
    let loads = 0;
    const cache = createFlagCache(
      () => {
        loads += 1;
        return Promise.resolve(closed);
      },
      () => time,
      () => undefined,
      1000,
    );
    await cache.get();
    time = 999;
    await cache.get();
    expect(loads).toBe(1);
    time = 1000;
    expect(await cache.get()).toEqual(closed);
    expect(loads).toBe(2);
  });

  it("keeps the last known flags when a load fails, and the defaults before any load worked", async () => {
    let time = 0;
    let fail = true;
    const errors: unknown[] = [];
    const cache = createFlagCache(
      () => (fail ? Promise.reject(new Error("down")) : Promise.resolve(closed)),
      () => time,
      (error) => errors.push(error),
      1000,
    );
    expect(await cache.get()).toEqual(DEFAULT_APP_FLAGS);
    fail = false;
    time = 1000;
    expect(await cache.get()).toEqual(closed);
    fail = true;
    time = 2000;
    expect(await cache.get()).toEqual(closed);
    expect(errors).toHaveLength(2);
  });
});
