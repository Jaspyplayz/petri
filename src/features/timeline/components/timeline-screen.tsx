import { Suspense } from "react";
import { TimelineFeed } from "./timeline-feed";

export function TimelineScreen() {
  return (
    <section data-testid="timeline-panel" aria-labelledby="timeline-heading" className="space-y-6">
      <header className="space-y-2">
        <h1 id="timeline-heading" data-testid="timeline-heading" className="text-3xl font-bold tracking-tight">
          {"Blobby's changes"}
        </h1>
        <p className="text-ink-soft">
          A diary of how Blobby has evolved, newest first. Each change started as something a visitor asked for.
        </p>
      </header>
      <Suspense fallback={<p className="text-ink-soft">Loading the timeline…</p>}>
        <TimelineFeed />
      </Suspense>
    </section>
  );
}
