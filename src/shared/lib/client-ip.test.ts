import { describe, expect, it } from "vitest";
import { clientIpFromHeaders, rateLimitBucket } from "./client-ip";

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("rateLimitBucket", () => {
  it("keeps IPv4 addresses as they are", () => {
    expect(rateLimitBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitBucket("unknown")).toBe("unknown");
  });

  it("unwraps IPv4-mapped IPv6", () => {
    expect(rateLimitBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("groups every address in one IPv6 /64 into the same bucket", () => {
    const a = rateLimitBucket("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = rateLimitBucket("2001:0db8:abcd:0012::9");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(rateLimitBucket("2001:db8:abcd:13::1")).not.toBe(a);
  });

  it("expands :: before taking the prefix", () => {
    expect(rateLimitBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitBucket("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitBucket("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("leaves malformed input usable as its own bucket", () => {
    expect(rateLimitBucket("1:2:3")).toBe("1:2:3");
  });

  it("groups two /64s of one IPv6 /48 into one /48 bucket and keeps their /64 buckets apart", () => {
    const a = "2001:db8:abcd:12::1";
    const b = "2001:0db8:abcd:ff00:1:2:3:4";
    expect(rateLimitBucket(a, 48)).toBe("2001:db8:abcd::/48");
    expect(rateLimitBucket(b, 48)).toBe(rateLimitBucket(a, 48));
    expect(rateLimitBucket(a, 64)).toBe("2001:db8:abcd:12::/64");
    expect(rateLimitBucket(b, 64)).toBe("2001:db8:abcd:ff00::/64");
    expect(rateLimitBucket("2001:db8:abce:12::1", 48)).not.toBe(rateLimitBucket(a, 48));
  });

  it("treats IPv4, mapped IPv4, zone ids, :: and malformed input the same way at /48", () => {
    expect(rateLimitBucket("203.0.113.7", 48)).toBe("203.0.113.7");
    expect(rateLimitBucket("unknown", 48)).toBe("unknown");
    expect(rateLimitBucket("::ffff:203.0.113.7", 48)).toBe("203.0.113.7");
    expect(rateLimitBucket("fe80::1%eth0", 48)).toBe("fe80:0:0::/48");
    expect(rateLimitBucket("2001:db8::1", 48)).toBe("2001:db8:0::/48");
    expect(rateLimitBucket("::1", 48)).toBe("0:0:0::/48");
    expect(rateLimitBucket("1:2:3", 48)).toBe("1:2:3");
  });
});
