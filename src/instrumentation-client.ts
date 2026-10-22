import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/shared/lib/sentry-options";

Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
