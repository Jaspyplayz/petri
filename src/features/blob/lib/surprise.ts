export const SEEN_STORAGE_ITEM = "petri.blob.seen.v1";

function countFrom(text: string | null): number | null {
  if (text === null || !/^\d{1,9}$/.test(text)) return null;
  return Number(text);
}

export function lastSeenCount(search: string, stored: string | null): number | null {
  return countFrom(new URLSearchParams(search).get("seen")) ?? countFrom(stored);
}

export function isSurprised(evolved: number, seen: number | null): boolean {
  return seen !== null && evolved > seen;
}

export type Surprise = { readonly evolved: number; readonly surprised: boolean };

let current: Surprise | null = null;
const listeners = new Set<() => void>();

export function subscribeToSurprise(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function currentSurprise(): Surprise | null {
  return current;
}

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_ITEM);
  } catch {
    return null;
  }
}

function writeSeen(evolved: number): void {
  try {
    window.localStorage.setItem(SEEN_STORAGE_ITEM, String(evolved));
  } catch {
    return;
  }
}

export function noticeEvolved(evolved: number): void {
  if (current?.evolved === evolved) return;
  const seen = lastSeenCount(window.location.search, readSeen());
  current = { evolved, surprised: isSurprised(evolved, seen) };
  writeSeen(evolved);
  for (const listener of listeners) listener();
}
