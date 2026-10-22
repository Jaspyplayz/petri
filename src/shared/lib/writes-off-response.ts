import "server-only";
import { writeEnvSource } from "@/shared/env";
import { log } from "./log";
import { writeAvailability } from "./write-availability";

export function writesOffResponse(): Response | undefined {
  const availability = writeAvailability(writeEnvSource());
  if (availability === "configured") return undefined;
  if (availability === "misconfigured") {
    log.error("server write secrets are missing or invalid", new Error("SUPABASE_SERVICE_ROLE_KEY / RATE_LIMIT_SALT"));
  }
  return Response.json({ error: "unavailable" }, { status: 503 });
}
