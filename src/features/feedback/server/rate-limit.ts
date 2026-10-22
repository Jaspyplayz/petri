import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/shared/env";
import { serviceSupabase } from "@/shared/supabase/service-client";
import { RATE_LIMITS, clientIpFromHeaders, type RateLimitedAction } from "../lib/rate-limits";

export function hashClientIp(headers: Headers): string {
  return createHash("sha256")
    .update(`${serverEnv().RATE_LIMIT_SALT}:${clientIpFromHeaders(headers)}`)
    .digest("hex");
}

export async function consumeRateLimit(ipHash: string, action: RateLimitedAction): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  const { data, error } = await serviceSupabase().rpc("consume_rate_limit", {
    p_ip_hash: ipHash,
    p_action: action,
    p_limit: limit,
    p_window: `${String(windowSeconds)} seconds`,
  });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return data;
}
