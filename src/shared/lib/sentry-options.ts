import type { BrowserOptions, NodeOptions } from "@sentry/nextjs";
import { publicEnv, runtimeEnvironment } from "@/shared/env";

type SharedSentryOptions = Pick<
  BrowserOptions & NodeOptions,
  "dsn" | "enabled" | "release" | "environment" | "tracesSampleRate"
>;

export function sentryOptions(): SharedSentryOptions {
  const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN;
  const environment = runtimeEnvironment();
  return {
    ...(dsn ? { dsn } : {}),
    enabled: dsn !== undefined,
    ...(publicEnv.NEXT_PUBLIC_COMMIT_SHA ? { release: publicEnv.NEXT_PUBLIC_COMMIT_SHA } : {}),
    environment,
    tracesSampleRate: environment === "production" ? 0.1 : 1,
  };
}
