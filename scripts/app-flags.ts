// pnpm app:flags                          prints the kill-switch flags
// pnpm app:flags set <flag> <true|false>  sets one: feedback_open (posting) or read_only_mode (every write)
// Add --prod to act on production (URL and service-role key from .env.setup); without it, the local stack (.env.local).
// The app caches the flags for 30 s per server instance, so a change takes up to that long to show.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { parseEnvFile } from "./setup-secrets/plan";

const FLAGS = ["feedback_open", "read_only_mode"] as const;
type Flag = (typeof FLAGS)[number];

const { values, positionals } = parseArgs({ allowPositionals: true, options: { prod: { type: "boolean", default: false } } });
const root = join(import.meta.dirname, "..");

function credentials(): { url: string; key: string } {
  const source = values.prod
    ? (() => {
        const path = join(root, ".env.setup");
        return existsSync(path) ? parseEnvFile(readFileSync(path, "utf8")) : new Map<string, string>();
      })()
    : new Map(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const url = source.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  const key = source.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (url === "" || key === "") {
    throw new Error(`app:flags needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ${values.prod ? ".env.setup" : ".env.local (run pnpm env:local)"}`);
  }
  return { url, key };
}

const { url, key } = credentials();
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const target = values.prod ? "production" : "local";

if (positionals[0] === "set") {
  const [, flag, value] = positionals;
  if (!FLAGS.includes(flag as Flag) || (value !== "true" && value !== "false")) {
    throw new Error(`usage: pnpm app:flags set <${FLAGS.join("|")}> <true|false> [--prod]`);
  }
  const { error } = await supabase.from("app_flags").update({ value: value === "true", updated_at: new Date().toISOString() }).eq("key", flag);
  if (error) throw new Error(error.message);
  process.stdout.write(`app:flags (${target}): ${String(flag)} = ${value}. The app picks it up within 30 s.\n`);
} else if (positionals.length > 0) {
  throw new Error("usage: pnpm app:flags [set <flag> <true|false>] [--prod]");
}

const { data, error } = await supabase.from("app_flags").select("key, value, updated_at").order("key");
if (error) throw new Error(error.message);
for (const row of data as { key: string; value: unknown; updated_at: string }[]) {
  process.stdout.write(`${row.key} = ${JSON.stringify(row.value)} (updated ${row.updated_at})\n`);
}
