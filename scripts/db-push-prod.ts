import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseEnvFile } from "./setup-secrets/plan";

const root = join(import.meta.dirname, "..");
const envSetupPath = join(root, ".env.setup");
const supabaseCli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");

const fromFile = existsSync(envSetupPath) ? parseEnvFile(readFileSync(envSetupPath, "utf8")) : new Map<string, string>();
const password = process.env.SUPABASE_DB_PASSWORD ?? fromFile.get("SUPABASE_DB_PASSWORD") ?? "";
const projectRef = process.env.SUPABASE_PROJECT_REF ?? fromFile.get("SUPABASE_PROJECT_REF") ?? "";

if (password === "" || projectRef === "") {
  process.stderr.write("db:push:prod needs SUPABASE_DB_PASSWORD and SUPABASE_PROJECT_REF (env or .env.setup).\n");
  process.exit(1);
}

const redact = (text: string) => text.split(password).join("[REDACTED]");

function supabase(args: readonly string[], input = ""): string {
  return redact(
    execFileSync(process.execPath, [supabaseCli, ...args], {
      cwd: root,
      env: { ...process.env, SUPABASE_DB_PASSWORD: password },
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    }),
  );
}

try {
  supabase(["link", "--project-ref", projectRef]);
  process.stdout.write(`Linked ${projectRef}. Pending migrations:\n${supabase(["db", "push", "--dry-run"])}\n`);
  process.stdout.write(`${supabase(["db", "push"], "y\n")}\n`);
  process.stdout.write(`${supabase(["migration", "list"])}\n`);
} catch (error) {
  const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : String(error);
  process.stderr.write(`db:push:prod failed:\n${redact(stderr)}\n`);
  process.exit(1);
}
