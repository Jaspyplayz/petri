import { join } from "node:path";
import { ensureServer, stopServer, VerifyServerError, verifyPort } from "./verify/server";

const root = join(import.meta.dirname, "..");
const usage = [
  "usage:",
  "  pnpm verify:up     build and start the app plus local Supabase, then print its URL",
  "  pnpm verify:down   stop the app that verify:up started",
  "",
].join("\n");

async function main(command: string | undefined): Promise<number> {
  switch (command ?? "") {
    case "up":
      process.stdout.write(`${await ensureServer(root, verifyPort())}\n`);
      return 0;
    case "down":
      process.stdout.write((await stopServer(root)) ? "verify: stopped the app\n" : "verify: no app was running\n");
      return 0;
    default:
      process.stderr.write(usage);
      return 2;
  }
}

try {
  process.exitCode = await main(process.argv[2]);
} catch (error) {
  if (!(error instanceof VerifyServerError)) throw error;
  process.stderr.write(`verify: ${error.message}\n`);
  process.exitCode = 2;
}
