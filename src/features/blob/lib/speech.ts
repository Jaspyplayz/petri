export type SpeechAction = "feed" | "poke";

export const SPEECH_MS = 3000;

const SPEECH_LINES: Readonly<Record<SpeechAction, string>> = {
  feed: "Yum! I am getting bigger!",
  poke: "Hehe, that tickles!",
};

export function speechLine(action: SpeechAction): string {
  return SPEECH_LINES[action];
}
