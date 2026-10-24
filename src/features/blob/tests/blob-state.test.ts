import { describe, expect, it } from "vitest";
import {
  BLOB_MAX_SIZE,
  feed,
  formatSize,
  initialBlobState,
  isFullyGrown,
  parseBlobState,
  poke,
  recolor,
  rename,
  serializeBlobState,
} from "../lib/blob-state";

describe("poke", () => {
  it("counts pokes without changing size", () => {
    const poked = poke(poke(initialBlobState));
    expect(poked.pokes).toBe(2);
    expect(poked.size).toBe(initialBlobState.size);
  });
});

describe("feed", () => {
  it("grows the blob a little each time", () => {
    const fed = feed(initialBlobState);
    expect(fed.size).toBe(1.05);
    expect(fed.feeds).toBe(1);
    expect(formatSize(fed)).toBe("105%");
  });

  it("never grows past the maximum size", () => {
    let state = initialBlobState;
    for (let i = 0; i < 100; i += 1) state = feed(state);
    expect(state.size).toBe(BLOB_MAX_SIZE);
    expect(isFullyGrown(state)).toBe(true);
    expect(state.feeds).toBe(100);
  });
});

describe("recolor", () => {
  it("changes the colour and keeps it through serialization", () => {
    const pink = recolor(initialBlobState, "pink");
    expect(pink.color).toBe("pink");
    expect(parseBlobState(serializeBlobState(pink)).color).toBe("pink");
  });

  it("defaults old stored state without a colour to green", () => {
    expect(parseBlobState('{"name":"Old","size":1.1,"pokes":2,"feeds":1}').color).toBe("green");
  });

  it("falls back to the initial state for an unknown colour", () => {
    expect(parseBlobState('{"name":"x","size":1,"pokes":0,"feeds":0,"color":"plaid"}')).toEqual(initialBlobState);
  });
});

describe("rename", () => {
  it("trims and accepts a valid name", () => {
    const result = rename(initialBlobState, "  Gloop  ");
    expect(result).toEqual({ ok: true, state: { ...initialBlobState, name: "Gloop" } });
  });

  it.each(["", "   ", "x".repeat(25)])("rejects %j", (name) => {
    const result = rename(initialBlobState, name);
    expect(result.ok).toBe(false);
  });
});

describe("parseBlobState", () => {
  it("round-trips through serialization", () => {
    const state = feed(poke(initialBlobState));
    expect(parseBlobState(serializeBlobState(state))).toEqual(state);
  });

  it.each([null, "not json", "{}", '{"name":"x","size":99,"pokes":0,"feeds":0}'])(
    "falls back to the initial state for %j",
    (raw) => {
      expect(parseBlobState(raw)).toEqual(initialBlobState);
    },
  );
});
