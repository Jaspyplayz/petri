import { z } from "zod";
import { type ServerEnv, serverSchema } from "./server-env-schema";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  NEXT_PUBLIC_COMMIT_SHA: z.string().optional(),
});

const emptyToUndefined = (value: string | undefined) => (value === "" ? undefined : value);

export type PublicEnv = z.infer<typeof publicSchema>;

export const publicEnv: PublicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SENTRY_DSN: emptyToUndefined(process.env.NEXT_PUBLIC_SENTRY_DSN),
  NEXT_PUBLIC_COMMIT_SHA: emptyToUndefined(process.env.NEXT_PUBLIC_COMMIT_SHA),
});

export function runtimeEnvironment(): string {
  return process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV;
}

export function serverRuntime(): string | undefined {
  return process.env.NEXT_RUNTIME;
}

let cachedServerEnv: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never run in the browser");
  }
  cachedServerEnv ??= serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RATE_LIMIT_SALT: process.env.RATE_LIMIT_SALT,
  });
  return cachedServerEnv;
}
