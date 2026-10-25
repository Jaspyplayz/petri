import "server-only";
import { diaryHeadline, diaryScene } from "../lib/diary";
import { listTimeline } from "../server/list-timeline";
import { ChangeArt } from "./change-art";

function Pair({
  scene,
  phase,
}: {
  readonly scene: ReturnType<typeof diaryScene>;
  readonly phase: "before" | "after";
}) {
  const label = phase === "before" ? "Before" : "After";
  return (
    <figure className="w-20">
      <ChangeArt scene={scene} phase={phase} width={80} height={80} />
      <figcaption
        className={`mt-1 text-center text-[10px] font-bold uppercase tracking-wide ${phase === "before" ? "text-culture-deep" : "text-poke-ink"}`}
      >
        {label}
      </figcaption>
    </figure>
  );
}

export async function HomeDiary() {
  const entries = (await listTimeline()).slice(0, 3);
  return (
    <section
      data-testid="timeline-home"
      aria-labelledby="timeline-home-heading"
      className="rounded-[28px] border border-ink/10 bg-card px-5 py-6 shadow-[0_12px_32px_rgb(70_50_20/0.06)]"
    >
      <h2 id="timeline-home-heading" data-testid="timeline-home-heading" className="text-center text-3xl font-extrabold tracking-tight">
        {"Blobby's changes"}
      </h2>
      {entries.length === 0 ? (
        <p className="mt-4 text-center text-sm text-ink-soft">Nothing has changed Blobby yet. When a lesson ships, it shows up here.</p>
      ) : (
        <ol className="mt-2 divide-y divide-ink/10">
          {entries.map((entry) => {
            const scene = diaryScene(entry.title, entry.summary, entry.kind);
            return (
              <li key={entry.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 py-4">
                <div data-testid="timeline-art" className="flex gap-2">
                  <Pair scene={scene} phase="before" />
                  <Pair scene={scene} phase="after" />
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold leading-snug">{diaryHeadline(entry.title, entry.kind)}</p>
                  <p className="mt-1 line-clamp-3 text-sm leading-snug text-ink-soft">{entry.summary}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
