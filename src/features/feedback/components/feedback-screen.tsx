import { Suspense } from "react";
import { FeedbackBoard } from "./feedback-board";
import { FeedbackPostArea } from "./feedback-post-area";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function FeedbackScreen({ searchParams }: { readonly searchParams: SearchParams }) {
  return (
    <section data-testid="feedback-panel" aria-labelledby="feedback-heading" className="space-y-8">
      <header className="space-y-2">
        <h1 id="feedback-heading" data-testid="feedback-heading" className="text-3xl font-bold tracking-tight">
          Teach Blobby
        </h1>
        <p className="text-ink-soft">
          Share an idea or a bug. The ideas with the most votes are taught to Blobby by agents, and may show up as
          evolutions on the Timeline.
        </p>
      </header>
      <Suspense fallback={<div className="h-56 rounded-3xl border border-ink/10 bg-agar-deep/60" />}>
        <FeedbackPostArea />
      </Suspense>
      <Suspense fallback={<p className="text-ink-soft">Loading feedback…</p>}>
        <FeedbackBoard searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
