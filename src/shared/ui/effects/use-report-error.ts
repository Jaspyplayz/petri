"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function useReportError(error: unknown): void {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
}
