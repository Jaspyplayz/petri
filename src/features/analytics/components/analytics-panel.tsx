import { formatHeading } from "../lib/format-heading";

export function AnalyticsPanel() {
  return (
    <section data-testid="analytics-panel" aria-labelledby="analytics-heading" className="space-y-2">
      <h2 id="analytics-heading" data-testid="analytics-heading" className="text-xl font-semibold">
        {formatHeading("Analytics")}
      </h2>
    </section>
  );
}
