export type TimeMood = "sleepy" | "awake";

const NIGHT_STARTS = 22;
const NIGHT_ENDS = 6;

export function timeMood(hour: number): TimeMood {
  return hour >= NIGHT_STARTS || hour < NIGHT_ENDS ? "sleepy" : "awake";
}

export function timeMoodLabel(mood: TimeMood): string {
  return mood === "sleepy" ? "Sleepy" : "Awake";
}

export function localHour(search: string, now: Date): number {
  const pinned = new URLSearchParams(search).get("hour");
  if (pinned !== null && /^\d{1,2}$/.test(pinned)) {
    const hour = Number(pinned);
    if (hour <= 23) return hour;
  }
  return now.getHours();
}
