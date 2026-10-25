import type { TimelineKind } from "./timeline-format";
import type { BlobLook } from "@/shared/ui/blob-glyph";

export type DiaryScene = "blush" | "wobble" | "blink" | "size" | "color" | "revert" | "general";
export type DiaryPhase = "before" | "after";

export type DiaryPortrait = {
  readonly fill: string;
  readonly look: BlobLook;
  readonly scale: number;
};

const GREEN = "#2f8f6b";
const PINK = "#e86fa3";
const WARM = "#f0a06a";

const VERBS: Readonly<Record<string, string>> = {
  blushes: "blush",
  grows: "grow",
  turns: "turn",
  changes: "change",
  wobbles: "wobble",
  sleeps: "sleep",
  naps: "nap",
};

export function diaryScene(title: string, summary: string, kind: TimelineKind): DiaryScene {
  if (kind === "revert") return "revert";
  const text = `${title}\n${summary}`.toLowerCase();
  if (/\b(?:blink\w*|wink\w*|eyes?\b|sleep\w*|naps?\b)/.test(text)) return "blink";
  if (/\b(?:wobble\w*|pokes?\b|poking\b)/.test(text)) return "wobble";
  if (/\b(?:blush\w*|happy\b|warm\w*)/.test(text)) return "blush";
  if (/\b(?:colou?rs?\b|pink\b|paint\w*|hues?\b)/.test(text)) return "color";
  if (/\b(?:grows?\b|growing\b|size\b|snacks?\b|feeds?\b|feeding\b|massive\b|expands?\b|bigger\b)/.test(text)) return "size";
  return "general";
}

export function diaryHeadline(title: string, kind: TimelineKind): string {
  if (kind === "revert") return title;
  const match = /^the blob\s+([a-z]+)(.*)$/i.exec(title.trim());
  const verb = match?.[1]?.toLowerCase();
  const voiced = verb ? VERBS[verb] : undefined;
  if (voiced) {
    const rest = (match?.[2] ?? "").replace(/\s+it$/i, " me");
    const sentence = `I ${voiced}${rest}`;
    return sentence.endsWith("!") ? sentence : `${sentence}!`;
  }
  const trimmed = title.trim();
  return /[!?]$/.test(trimmed) ? trimmed : `${trimmed}!`;
}

export function diaryPortrait(scene: DiaryScene, phase: DiaryPhase): DiaryPortrait {
  switch (scene) {
    case "blush":
      return phase === "before"
        ? { fill: GREEN, look: "plain", scale: 0.74 }
        : { fill: WARM, look: "blush", scale: 0.9 };
    case "wobble":
      return phase === "before"
        ? { fill: GREEN, look: "full", scale: 0.66 }
        : { fill: GREEN, look: "squash", scale: 0.96 };
    case "blink":
      return phase === "before"
        ? { fill: GREEN, look: "full", scale: 0.78 }
        : { fill: GREEN, look: "wink", scale: 0.78 };
    case "size":
      return phase === "before"
        ? { fill: GREEN, look: "full", scale: 0.42 }
        : { fill: GREEN, look: "full", scale: 1 };
    case "color":
      return phase === "before"
        ? { fill: GREEN, look: "plain", scale: 0.9 }
        : { fill: PINK, look: "plain", scale: 0.9 };
    case "revert":
      return phase === "before"
        ? { fill: GREEN, look: "squash", scale: 0.78 }
        : { fill: GREEN, look: "full", scale: 0.78 };
    case "general":
      return phase === "before"
        ? { fill: GREEN, look: "plain", scale: 0.72 }
        : { fill: GREEN, look: "full", scale: 0.8 };
  }
}
