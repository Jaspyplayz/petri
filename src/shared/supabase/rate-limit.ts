import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/shared/env";
import { clientIpFromHeaders, rateLimitBucket, type Ipv6Prefix } from "@/shared/lib/client-ip";
import { serviceSupabase } from "./service-client";

export type RateLimitAction = "post" | "vote" | "report" | "event";

export type RateLimitRule = {
  readonly limit: number;
  readonly windowSeconds: number;
};

export function hashClientIp(headers: Headers, ipv6Prefix: Ipv6Prefix = 64): string {
  return createHash("sha256")
    .update(`${serverEnv().RATE_LIMIT_SALT}:${rateLimitBucket(clientIpFromHeaders(headers), ipv6Prefix)}`)
    .digest("hex");
}

export async function consumeRateLimit(ipHash: string, action: RateLimitAction, rule: RateLimitRule): Promise<boolean> {
  const { data, error } = await serviceSupabase().rpc("consume_rate_limit", {
    p_ip_hash: ipHash,
    p_action: action,
    p_limit: rule.limit,
    p_window: `${String(rule.windowSeconds)} seconds`,
  });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return data;
}

export function rateLimitedResponse(rule: RateLimitRule): Response {
  return Response.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(rule.windowSeconds) } },
  );
}
