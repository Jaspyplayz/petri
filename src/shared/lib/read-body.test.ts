import { describe, expect, it } from "vitest";
import { readBodyWithLimit } from "./read-body";

function streamingRequest(chunks: readonly string[], headers: HeadersInit = {}): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://localhost/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

describe("readBodyWithLimit", () => {
  it("returns the text when under the limit", async () => {
    const result = await readBodyWithLimit(new Request("http://localhost/x", { method: "POST", body: "héllo" }), 64);
    expect(result).toEqual({ ok: true, text: "héllo" });
  });

  it("rejects early on a large declared Content-Length", async () => {
    const result = await readBodyWithLimit(streamingRequest(["x"], { "content-length": "999999" }), 64);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("stops reading a stream once it passes the limit", async () => {
    const result = await readBodyWithLimit(streamingRequest(["a".repeat(40), "b".repeat(40), "c".repeat(40)]), 64);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("treats a missing body as empty", async () => {
    expect(await readBodyWithLimit(new Request("http://localhost/x", { method: "POST" }), 64)).toEqual({
      ok: true,
      text: "",
    });
  });
});
