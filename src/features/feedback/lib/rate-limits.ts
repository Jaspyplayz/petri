export type RateLimitedAction = "post" | "vote";

export type RateLimit = {
  readonly limit: number;
  readonly windowSeconds: number;
};

export const RATE_LIMITS: Readonly<Record<RateLimitedAction, RateLimit>> = {
  post: { limit: 5, windowSeconds: 60 * 60 },
  vote: { limit: 30, windowSeconds: 60 * 60 },
};

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : "unknown";
}
