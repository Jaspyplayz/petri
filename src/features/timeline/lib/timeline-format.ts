export type TimelineKind = "change" | "revert";

export function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

export function liveChangeCount(changes: number, reverts: number): number {
  return Math.max(0, changes - reverts);
}

export function evolvedLine(count: number): string {
  const times = count === 1 ? "time" : "times";
  return `Evolved ${String(count)} ${times} from visitor ideas`;
}

export function revertDiaryLine(): string {
  return "This undid a change that hurt Blobby.";
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
