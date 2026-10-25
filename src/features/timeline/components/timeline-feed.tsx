import "server-only";
import { evolvedLine, liveChangeCount } from "../lib/timeline-format";
import { countChanges, listTimeline } from "../server/list-timeline";
import { TimelineEntry } from "./timeline-entry";

export async function TimelineFeed() {
  const [entries, counts] = await Promise.all([listTimeline(), countChanges()]);
  const shipped = liveChangeCount(counts.changes, counts.reverts);
  return (
    <div className="space-y-6">
      <p data-testid="timeline-counter" className="text-lg font-semibold text-culture-deep">
        {evolvedLine(shipped)}
      </p>
      {entries.length === 0 ? (
        <p data-testid="timeline-empty" className="text-ink-soft">
          Nothing has changed Blobby yet. When a lesson ships, it shows up here.
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
