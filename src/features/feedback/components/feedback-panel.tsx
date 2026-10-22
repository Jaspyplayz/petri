import { formatHeading } from "../lib/format-heading";

export function FeedbackPanel() {
  return (
    <section data-testid="feedback-panel" aria-labelledby="feedback-heading" className="space-y-2">
      <h2 id="feedback-heading" data-testid="feedback-heading" className="text-xl font-semibold">
        {formatHeading("Feedback")}
      </h2>
    </section>
  );
}
