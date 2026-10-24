import { Suspense } from "react";
import { FeedbackBoard } from "./feedback-board";
import { FeedbackPostArea } from "./feedback-post-area";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function FeedbackScreen({ searchParams }: { readonly searchParams: SearchParams }) {
  return (
    <section data-testid="feedback-panel" aria-labelledby="feedback-heading" className="space-y-8">
      <header className="space-y-2">
        <h1 id="feedback-heading" data-testid="feedback-heading" className="text-3xl font-bold tracking-tight">
          Feedback
        </h1>
        <p className="text-ink-soft">
          Suggest an idea or report a bug. The most-voted items get picked up by Petri&apos;s agents and may ship on the
          Timeline.
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
