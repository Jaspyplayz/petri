import { join } from "node:path";
import { writeEnvLocal } from "./env-local/write";

writeEnvLocal(join(import.meta.dirname, ".."));
process.stdout.write("wrote .env.local from `supabase status` (run `pnpm db:start` first if this failed)\n");
