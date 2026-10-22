"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function useLocalStorage(key: string): readonly [string | null, (value: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const keyListeners = listeners.get(key) ?? new Set();
      keyListeners.add(onChange);
      listeners.set(key, keyListeners);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        keyListeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  const value = useSyncExternalStore(
    subscribe,
    () => readKey(key),
    () => null,
  );

  const setValue = useCallback(
    (next: string) => {
      writeKey(key, next);
      notify(key);
    },
    [key],
  );

  return [value, setValue] as const;
}
