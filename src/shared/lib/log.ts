import * as Sentry from "@sentry/nextjs";

type LogContext = Readonly<Record<string, unknown>>;

export const log = {
  error(message: string, error: unknown, context: LogContext = {}): void {
    Sentry.captureException(error, { extra: { message, ...context } });
    console.error(message, error, context);
  },
  warn(message: string, context: LogContext = {}): void {
    Sentry.captureMessage(message, { level: "warning", extra: context });
    console.warn(message, context);
  },
};
