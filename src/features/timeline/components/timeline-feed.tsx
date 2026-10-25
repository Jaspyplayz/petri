import "server-only";
import { evolvedLine, liveChangeCount } from "../lib/timeline-format";
import { countChanges, listTimeline } from "../server/list-timeline";
import { TimelineEntry } from "./timeline-entry";

export async function TimelineFeed() {
  const [entries, counts] = await Promise.all([listTimeline(), countChanges()]);
  const shipped = liveChangeCount(counts.changes, counts.reverts);
  return (
    <div className="space-y-6">
      <p
        data-testid="timeline-counter"
        className="inline-block bg-[linear-gradient(90deg,#e56b9a_0%,#ef9a45_22%,#6fbe73_55%,#6aa4e4_78%,#b07ad6_100%)] bg-clip-text text-lg font-extrabold text-transparent"
      >
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
