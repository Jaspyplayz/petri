export type TimelineKind = "change" | "revert";

export const CHANGES_WRITTEN_BY_HUMANS = 0;

export function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

export function liveChangeCount(changes: number, reverts: number): number {
  return Math.max(0, changes - reverts);
}

export function shippedCounterText(shipped: number): string {
  const noun = shipped === 1 ? "change" : "changes";
  return `${String(shipped)} ${noun} shipped, ${String(CHANGES_WRITTEN_BY_HUMANS)} written by humans`;
}

const mergedAtFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatMergedAt(iso: string): string {
  return mergedAtFormatter.format(new Date(iso));
}

export function trustLevelLabel(level: number): string {
  return `Trust level ${String(level)}`;
}
