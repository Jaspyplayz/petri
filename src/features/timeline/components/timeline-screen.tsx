import { Suspense } from "react";
import { TimelineFeed } from "./timeline-feed";

export function TimelineScreen() {
  return (
    <section data-testid="timeline-panel" aria-labelledby="timeline-heading" className="space-y-6">
      <header className="space-y-2">
        <h1 id="timeline-heading" data-testid="timeline-heading" className="text-3xl font-bold tracking-tight">
          Timeline
        </h1>
        <p className="text-ink-soft">
          Every change to Petri, newest first. Each one came from visitor feedback and was built, checked and merged by
          AI agents.
        </p>
      </header>
      <Suspense fallback={<p className="text-ink-soft">Loading the timeline…</p>}>
        <TimelineFeed />
      </Suspense>
    </section>
  );
}
