import { formatHeading } from "../lib/format-heading";

export function TimelinePanel() {
  return (
    <section data-testid="timeline-panel" aria-labelledby="timeline-heading" className="space-y-2">
      <h2 id="timeline-heading" data-testid="timeline-heading" className="text-xl font-semibold">
        {formatHeading("Timeline")}
      </h2>
    </section>
  );
}
