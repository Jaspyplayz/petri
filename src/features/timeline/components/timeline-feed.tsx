import "server-only";
import { countShippedChanges, shippedCounterText } from "../lib/timeline-format";
import { listTimeline } from "../server/list-timeline";
import { TimelineEntry } from "./timeline-entry";

export async function TimelineFeed() {
  const entries = await listTimeline();
  const shipped = countShippedChanges(entries.map((entry) => entry.kind));
  return (
    <div className="space-y-6">
      <p data-testid="timeline-counter" className="text-lg font-semibold text-culture-deep">
        {shippedCounterText(shipped)}
      </p>
      {entries.length === 0 ? (
        <p data-testid="timeline-empty" className="text-ink-soft">
          Nothing has shipped yet. The first change will appear here.
        </p>
      ) : (
        <ol data-testid="timeline-list" className="space-y-4">
          {entries.map((entry) => (
            <TimelineEntry key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </div>
  );
}
