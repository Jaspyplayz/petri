export type AppFlags = { readonly feedbackOpen: boolean; readonly readOnly: boolean };

export type WriteAction = "post" | "vote" | "report" | "event";

export type FlagBlock = "read_only" | "feedback_closed";

export const DEFAULT_APP_FLAGS: AppFlags = { feedbackOpen: true, readOnly: false };

export const APP_FLAGS_TTL_MS = 30_000;

export function parseAppFlags(rows: readonly { readonly key: string; readonly value: unknown }[]): AppFlags {
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const feedbackOpen = value("feedback_open");
  const readOnly = value("read_only_mode");
  return {
    feedbackOpen: typeof feedbackOpen === "boolean" ? feedbackOpen : DEFAULT_APP_FLAGS.feedbackOpen,
    readOnly: typeof readOnly === "boolean" ? readOnly : DEFAULT_APP_FLAGS.readOnly,
  };
}

export function blockedBy(flags: AppFlags, action: WriteAction): FlagBlock | undefined {
  if (flags.readOnly) return "read_only";
  if (action === "post" && !flags.feedbackOpen) return "feedback_closed";
  return undefined;
}

export function postingOpen(flags: AppFlags): boolean {
  return blockedBy(flags, "post") === undefined;
}

export type FlagCache = { readonly get: () => Promise<AppFlags> };

export function createFlagCache(
  load: () => Promise<AppFlags>,
  now: () => number,
  onError: (error: unknown) => void,
  ttlMs = APP_FLAGS_TTL_MS,
): FlagCache {
  let cached: { readonly flags: AppFlags; readonly at: number } | undefined;
  return {
    get: async () => {
      if (cached && now() - cached.at < ttlMs) return cached.flags;
      try {
        cached = { flags: await load(), at: now() };
      } catch (error) {
        onError(error);
        cached = { flags: cached?.flags ?? DEFAULT_APP_FLAGS, at: now() };
      }
      return cached.flags;
    },
  };
}
