import * as Sentry from "@sentry/nextjs";
import { serverRuntime } from "@/shared/env";
import { sentryOptions } from "@/shared/lib/sentry-options";

export function register(): void {
  if (serverRuntime() === "nodejs" || serverRuntime() === "edge") {
    Sentry.init(sentryOptions());
  }
}

export const onRequestError = Sentry.captureRequestError;
