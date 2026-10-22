import { z } from "zod";

export const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RATE_LIMIT_SALT: z.string().min(16),
});

export type ServerEnv = z.infer<typeof serverSchema>;
