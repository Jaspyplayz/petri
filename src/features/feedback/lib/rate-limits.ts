export type RateLimitedAction = "post" | "vote";

export type RateLimit = {
  readonly limit: number;
  readonly windowSeconds: number;
};

export const RATE_LIMITS: Readonly<Record<RateLimitedAction, RateLimit>> = {
  post: { limit: 5, windowSeconds: 60 * 60 },
  vote: { limit: 30, windowSeconds: 60 * 60 },
};
