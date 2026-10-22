import { describe, expect, it } from "vitest";
import { MAX_EVENT_BODY_BYTES, parseEventBody } from "../lib/event-payload";

const valid = { featureId: "blob", action: "poke", path: "/" };

describe("parseEventBody", () => {
  it("accepts a valid event", () => {
    expect(parseEventBody(JSON.stringify(valid))).toEqual({ ok: true, event: valid });
  });

  it("strips unknown keys so no extra data is stored", () => {
    const result = parseEventBody(JSON.stringify({ ...valid, email: "a@b.c" }));
    expect(result).toEqual({ ok: true, event: valid });
  });

  it("rejects malformed JSON", () => {
    expect(parseEventBody("{nope")).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("rejects oversized bodies before parsing", () => {
    const huge = JSON.stringify({ ...valid, path: `/${"a".repeat(MAX_EVENT_BODY_BYTES)}` });
    expect(parseEventBody(huge)).toEqual({ ok: false, reason: "too_large" });
  });

  it.each([
    { ...valid, featureId: "Blob" },
    { ...valid, action: "" },
    { ...valid, path: "https://evil.example/" },
    { ...valid, path: "/feedback?email=a@b.c" },
    { featureId: "blob", action: "poke" },
  ])("rejects invalid event %j", (event) => {
    expect(parseEventBody(JSON.stringify(event))).toEqual({ ok: false, reason: "invalid_event" });
  });
});
