import Image from "next/image";
import { Card } from "@/shared/ui/card";
import { diaryScene, type DiaryPhase } from "../lib/diary";
import { formatMergedAt, revertDiaryLine, shortSha, trustLevelLabel } from "../lib/timeline-format";
import type { TimelineEntry as Entry } from "../server/list-timeline";
import { ChangeArt } from "./change-art";

function ArtFrame({
  label,
  phase,
  urls,
  scene,
}: {
  readonly label: string;
  readonly phase: DiaryPhase;
  readonly urls: readonly string[];
  readonly scene: ReturnType<typeof diaryScene>;
}) {
  return (
    <figure className="space-y-2">
      <div className="flex gap-2">
        {urls.length === 0 ? (
          <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-agar">
            <ChangeArt scene={scene} phase={phase} width={96} height={96} />
          </div>
        ) : (
          urls.map((url, index) => (
            <Image
              key={url}
              src={url}
              alt={`${label} ${String(index + 1)}`}
              width={320}
              height={200}
              unoptimized
              className="h-auto w-40 rounded-3xl border border-ink/10"
            />
          ))
        )}
      </div>
      <figcaption
        className={`text-xs font-bold uppercase tracking-wide ${phase === "before" ? "text-culture-deep" : "text-poke-ink"}`}
      >
        {label}
      </figcaption>
    </figure>
  );
}

export function TimelineEntry({ entry }: { readonly entry: Entry }) {
  const sha = shortSha(entry.commit_sha);
  const isRevert = entry.kind === "revert";
  const scene = diaryScene(entry.title, entry.summary, entry.kind);
  return (
    <li>
      <Card data-testid="timeline-entry" data-kind={entry.kind} className={isRevert ? "border-warning/40" : ""}>
        <article className="space-y-4">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {isRevert ? (
                <span
                  data-testid="timeline-revert-badge"
                  className="rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-agar"
                >
                  Reverted
                </span>
              ) : null}
              <time dateTime={entry.merged_at} className="text-xs text-ink-soft">
                {formatMergedAt(entry.merged_at)}
              </time>
            </div>
            <h2 data-testid="timeline-entry-title" className="text-xl font-semibold tracking-tight">
              {entry.title}
            </h2>
            {isRevert ? (
              <p data-testid="timeline-revert-note" className="text-sm text-ink-soft">
                {revertDiaryLine()}
              </p>
            ) : null}
          </header>

          <div data-testid="timeline-art" className="flex flex-wrap gap-6">
            <ArtFrame label="Before" phase="before" urls={entry.before_screenshot_urls} scene={scene} />
            <ArtFrame label="After" phase="after" urls={entry.after_screenshot_urls} scene={scene} />
          </div>

          {entry.linkedFeedback.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Because visitors said</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {entry.linkedFeedback.map((item) => (
                  <li key={item.id} className="rounded-2xl bg-agar px-3 py-2">
                    {`“${item.body}”`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="text-sm text-ink-soft">
            <summary className="cursor-pointer font-medium text-ink">More about this change</summary>
            <div className="mt-3 space-y-3">
              <p className="leading-relaxed text-ink">{entry.summary}</p>
              <footer className="flex flex-wrap items-center gap-3">
                {entry.pr_url && entry.pr_number ? (
                  <a href={entry.pr_url} data-testid="timeline-pr-link" className="font-medium text-culture-deep underline">
                    {`PR #${String(entry.pr_number)}`}
                  </a>
                ) : null}
                {sha ? <code className="rounded bg-agar px-1.5 py-0.5 font-mono text-xs">{sha}</code> : null}
                <span>{trustLevelLabel(entry.trust_level)}</span>
              </footer>
            </div>
          </details>
        </article>
      </Card>
    </li>
  );
}
