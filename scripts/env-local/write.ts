import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseEnvFile } from "../setup-secrets/plan";
import { renderEnvLocal } from "./render";

export const supabaseCli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");

export function writeEnvLocal(root: string): void {
  const envLocalPath = join(root, ".env.local");
  const statusJson = execFileSync(process.execPath, [supabaseCli, "status", "-o", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const existingSalt = existsSync(envLocalPath)
    ? parseEnvFile(readFileSync(envLocalPath, "utf8")).get("RATE_LIMIT_SALT")
    : undefined;
  writeFileSync(envLocalPath, renderEnvLocal(statusJson, existingSalt));
}
