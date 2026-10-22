import { describe, expect, it } from "vitest";
import { renderEnvLocal } from "./render";

const status = JSON.stringify({ API_URL: "http://127.0.0.1:54321", ANON_KEY: "anon", SERVICE_ROLE_KEY: "service", DB_URL: "x" });

describe("renderEnvLocal", () => {
  it("maps supabase status to the app's env names", () => {
    const env = renderEnvLocal(status, "an-existing-salt-value");
    expect(env).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n");
    expect(env).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=anon\n");
    expect(env).toContain("SUPABASE_SERVICE_ROLE_KEY=service\n");
    expect(env).toContain("RATE_LIMIT_SALT=an-existing-salt-value\n");
  });

  it("generates a salt when there is none or it is too short", () => {
    expect(renderEnvLocal(status, undefined)).toMatch(/RATE_LIMIT_SALT=[0-9a-f]{32}\n/);
    expect(renderEnvLocal(status, "short")).toMatch(/RATE_LIMIT_SALT=[0-9a-f]{32}\n/);
  });

  it("fails loudly when supabase isn't running", () => {
    expect(() => renderEnvLocal("{}", undefined)).toThrow();
  });
});
