const UNITS: readonly (readonly [string, number])[] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function feedbackAgeLabel(createdAt: string, now: number): string {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return "";
  const seconds = Math.max(0, Math.floor((now - created) / 1000));
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${String(count)} ${unit}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}
