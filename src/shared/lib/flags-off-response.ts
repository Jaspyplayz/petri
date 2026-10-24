import "server-only";
import { publicSupabase } from "@/shared/supabase/public-client";
import { blockedBy, createFlagCache, parseAppFlags, type AppFlags, type WriteAction } from "./app-flags";
import { log } from "./log";

const cache = createFlagCache(
  async () => {
    const { data, error } = await publicSupabase().from("app_flags").select("key, value");
    if (error) throw new Error(error.message);
    return parseAppFlags(data);
  },
  () => Date.now(),
  (error) => {
    log.error("app flags: failed to read, keeping the last known flags", error);
  },
);

export function appFlags(): Promise<AppFlags> {
  return cache.get();
}

export async function flagsOffResponse(action: WriteAction): Promise<Response | undefined> {
  const block = blockedBy(await appFlags(), action);
  return block ? Response.json({ error: block }, { status: 503 }) : undefined;
}
