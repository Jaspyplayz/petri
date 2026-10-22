import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseEnvFile } from "./setup-secrets/plan";
import { renderEnvLocal } from "./env-local/render";

const root = join(import.meta.dirname, "..");
const envLocalPath = join(root, ".env.local");
const supabaseCli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");

const statusJson = execFileSync(process.execPath, [supabaseCli, "status", "-o", "json"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});

const existingSalt = existsSync(envLocalPath)
  ? parseEnvFile(readFileSync(envLocalPath, "utf8")).get("RATE_LIMIT_SALT")
  : undefined;

writeFileSync(envLocalPath, renderEnvLocal(statusJson, existingSalt));
process.stdout.write("wrote .env.local from `supabase status` (run `pnpm db:start` first if this failed)\n");
