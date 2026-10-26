export type TimeMood = "sleepy" | "awake";
export type ShownMood = TimeMood | "happy";

export const HAPPY_MS = 4000;

const NIGHT_STARTS = 22;
const NIGHT_ENDS = 6;

export function timeMood(hour: number): TimeMood {
  return hour >= NIGHT_STARTS || hour < NIGHT_ENDS ? "sleepy" : "awake";
}

export function shownMood(time: TimeMood, justFed: boolean): ShownMood {
  return time === "awake" && justFed ? "happy" : time;
}

export function timeMoodLabel(mood: ShownMood): string {
  if (mood === "happy") return "Happy";
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
