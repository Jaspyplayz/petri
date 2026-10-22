import { serverSchema } from "@/shared/server-env-schema";

export type WriteAvailability = "configured" | "off-on-preview" | "misconfigured";

type EnvSource = Readonly<Record<string, string | undefined>>;

export function writeAvailability(env: EnvSource): WriteAvailability {
  const secrets = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    RATE_LIMIT_SALT: env.RATE_LIMIT_SALT,
  });
  if (secrets.success) return "configured";
  return env.VERCEL_ENV === "preview" ? "off-on-preview" : "misconfigured";
}
