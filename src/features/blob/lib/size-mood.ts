import type { BlobState } from "./blob-state";

export function sizeMood(state: BlobState): string {
  const percent = Math.round(state.size * 100);
  if (percent >= 200) return "MASSIVE!";
  if (percent >= 160) return "Huge!";
  if (percent >= 130) return "Plump!";
  if (percent >= 105) return "Growing!";
  return "Cozy!";
}

export function snackMood(feeds: number): string | null {
  return feeds > 0 ? "Yummy!" : null;
}
