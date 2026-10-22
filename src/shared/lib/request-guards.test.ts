import { describe, expect, it } from "vitest";
import { crossSiteFailure, guardJsonWrite, jsonContentTypeFailure } from "./request-guards";

function post(headers: Record<string, string>): Request {
  return new Request("http://petri.test/api/x", { method: "POST", headers: { host: "petri.test", ...headers } });
}

describe("crossSiteFailure", () => {
  it("allows same-origin browser requests and non-browser clients", () => {
    expect(crossSiteFailure(post({ "sec-fetch-site": "same-origin", origin: "http://petri.test" }))).toBeNull();
    expect(crossSiteFailure(post({}))).toBeNull();
  });

  it.each([
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { origin: "https://evil.example" },
    { origin: "null" },
  ])("rejects %j", (headers) => {
    expect(crossSiteFailure(post(headers))).toEqual({ status: 403, error: "cross_site" });
  });

  it("compares against the forwarded host behind a proxy", () => {
    expect(crossSiteFailure(post({ origin: "https://petri.app", "x-forwarded-host": "petri.app" }))).toBeNull();
  });
});

describe("jsonContentTypeFailure", () => {
  it("accepts JSON with parameters", () => {
    expect(jsonContentTypeFailure(post({ "content-type": "application/json; charset=utf-8" }))).toBeNull();
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data", ""])("rejects %j", (type) => {
    expect(jsonContentTypeFailure(post(type ? { "content-type": type } : {}))).toEqual({
      status: 415,
      error: "unsupported_media_type",
    });
  });
});

describe("guardJsonWrite", () => {
  it("checks origin before content type", () => {
    expect(guardJsonWrite(post({ origin: "https://evil.example", "content-type": "text/plain" }))?.status).toBe(403);
  });
});
