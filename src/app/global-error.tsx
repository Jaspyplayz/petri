"use client";

import { useReportError } from "@/shared/ui/effects/use-report-error";
import "./globals.css";

export default function GlobalError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  useReportError(error);
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center p-6">
        <title>Something went wrong · Petri</title>
        <div className="space-y-4 text-center" data-testid="global-error">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-ink-soft">The error was reported. You can try again.</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-full bg-culture-deep px-4 py-2 text-sm font-semibold text-agar hover:bg-ink"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
