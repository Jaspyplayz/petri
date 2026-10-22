import { describe, expect, it } from "vitest";
import { writeAvailability } from "./write-availability";

const secrets = { SUPABASE_SERVICE_ROLE_KEY: "service-role", RATE_LIMIT_SALT: "0123456789abcdef" };

describe("writeAvailability", () => {
  it("is configured when both server secrets are valid, on any environment", () => {
    expect(writeAvailability({ ...secrets, VERCEL_ENV: "preview" })).toBe("configured");
    expect(writeAvailability({ ...secrets, VERCEL_ENV: "production" })).toBe("configured");
    expect(writeAvailability(secrets)).toBe("configured");
  });

  it("is quietly off on previews, which never receive the server secrets", () => {
    expect(writeAvailability({ VERCEL_ENV: "preview" })).toBe("off-on-preview");
  });

  it("is misconfigured anywhere else when a secret is missing or invalid", () => {
    expect(writeAvailability({ VERCEL_ENV: "production" })).toBe("misconfigured");
    expect(writeAvailability({})).toBe("misconfigured");
    expect(writeAvailability({ ...secrets, RATE_LIMIT_SALT: "short", VERCEL_ENV: "production" })).toBe("misconfigured");
    expect(writeAvailability({ ...secrets, SUPABASE_SERVICE_ROLE_KEY: "", VERCEL_ENV: "production" })).toBe("misconfigured");
  });
});
