import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/shared/env";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

export function serviceSupabase(): SupabaseClient<Database> {
  client ??= createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}
