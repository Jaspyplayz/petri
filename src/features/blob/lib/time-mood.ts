export type TimeMood = "sleepy" | "awake";
export type SnackMood = "happy" | "sad" | "excited" | "content";
export type ShownMood = TimeMood | SnackMood | "surprised";

export const HAPPY_MS = 4000;

const NIGHT_STARTS = 22;
const NIGHT_ENDS = 6;

export function timeMood(hour: number): TimeMood {
  return hour >= NIGHT_STARTS || hour < NIGHT_ENDS ? "sleepy" : "awake";
}

export type PokePose = "wobble" | "shrink" | "shake" | "bounce" | "sway";

export const COLOR_FEELINGS: Readonly<Record<string, { readonly snack: SnackMood; readonly poke: PokePose }>> = {
  pink: { snack: "happy", poke: "shake" },
  purple: { snack: "sad", poke: "shrink" },
  orange: { snack: "excited", poke: "bounce" },
  blue: { snack: "content", poke: "sway" },
  green: { snack: "happy", poke: "wobble" },
};

export function colorSnackMood(color: string): SnackMood {
  return COLOR_FEELINGS[color]?.snack ?? "happy";
}

export function colorPokePose(color: string): PokePose {
  return COLOR_FEELINGS[color]?.poke ?? "wobble";
}

export function shownMood(time: TimeMood, justFed: boolean, surprised = false, snack: SnackMood = "happy"): ShownMood {
  if (time === "awake" && justFed) return snack;
  return surprised ? "surprised" : time;
}

export function timeMoodLabel(mood: ShownMood): string {
  if (mood === "happy") return "Happy";
  if (mood === "sad") return "Sad";
  if (mood === "excited") return "Excited";
  if (mood === "content") return "Content";
  if (mood === "surprised") return "Surprised";
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
