import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/shared/env";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

export function publicSupabase(): SupabaseClient<Database> {
  client ??= createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}
