import Image from "next/image";
import { Card } from "@/shared/ui/card";
import { formatMergedAt, shortSha, trustLevelLabel } from "../lib/timeline-format";
import type { TimelineEntry as Entry } from "../server/list-timeline";

function Screenshots({ label, urls }: { readonly label: string; readonly urls: readonly string[] }) {
  if (urls.length === 0) return null;
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</figcaption>
      <div className="flex gap-2 overflow-x-auto">
        {urls.map((url, index) => (
          <Image
            key={url}
            src={url}
            alt={`${label} screenshot ${String(index + 1)}`}
            width={320}
            height={200}
            unoptimized
            className="h-auto w-40 rounded-xl border border-ink/10"
          />
        ))}
      </div>
    </figure>
  );
}

export function TimelineEntry({ entry }: { readonly entry: Entry }) {
  const sha = shortSha(entry.commit_sha);
  const isRevert = entry.kind === "revert";
  return (
    <li>
      <Card data-testid="timeline-entry" data-kind={entry.kind} className={isRevert ? "border-warning/40" : ""}>
        <article className="space-y-3">
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              {isRevert ? (
                <span
                  data-testid="timeline-revert-badge"
                  className="rounded-full bg-warning px-2 py-0.5 font-semibold text-agar"
                >
                  Reverted
                </span>
              ) : null}
              <time dateTime={entry.merged_at}>{formatMergedAt(entry.merged_at)}</time>
              <span aria-hidden="true">·</span>
              <span>{trustLevelLabel(entry.trust_level)}</span>
            </div>
            <h2 data-testid="timeline-entry-title" className="text-lg font-semibold">
              {entry.title}
            </h2>
          </header>
          <p className="text-sm leading-relaxed">{entry.summary}</p>

          {entry.linkedFeedback.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Because visitors said</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {entry.linkedFeedback.map((item) => (
                  <li key={item.id} className="rounded-xl bg-agar px-3 py-2">
                    “{item.body}”
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-4">
            <Screenshots label="Before" urls={entry.before_screenshot_urls} />
            <Screenshots label="After" urls={entry.after_screenshot_urls} />
          </div>

          <footer className="flex flex-wrap gap-3 text-sm">
            {entry.pr_url && entry.pr_number ? (
              <a href={entry.pr_url} data-testid="timeline-pr-link" className="font-medium text-culture-deep underline">
                PR #{entry.pr_number}
              </a>
            ) : null}
            {sha ? <code className="rounded bg-agar px-1.5 py-0.5 font-mono text-xs">{sha}</code> : null}
          </footer>
        </article>
      </Card>
    </li>
  );
}
