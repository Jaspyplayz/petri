import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/shared/supabase/database.types";

// The loop's scripts run in CI (or locally against `pnpm db:start`) with the service role, which bypasses RLS.
export function loopSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (pnpm env:local writes them for the local database)");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
