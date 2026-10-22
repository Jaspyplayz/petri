import "server-only";
import { log } from "@/shared/lib/log";
import { readBodyWithLimit } from "@/shared/lib/read-body";
import { guardJsonWrite } from "@/shared/lib/request-guards";
import { writesOffResponse } from "@/shared/lib/writes-off-response";
import { consumeRateLimit, hashClientIp, rateLimitedResponse } from "@/shared/supabase/rate-limit";
import { serviceSupabase } from "@/shared/supabase/service-client";
import { EVENT_RATE_LIMIT, MAX_EVENT_BODY_BYTES, parseEventBody } from "../lib/event-payload";

export async function handleEventRequest(request: Request): Promise<Response> {
  const guard = guardJsonWrite(request);
  if (guard) return Response.json({ error: guard.error }, { status: guard.status });

  const body = await readBodyWithLimit(request, MAX_EVENT_BODY_BYTES);
  if (!body.ok) return Response.json({ error: body.reason }, { status: 413 });

  const parsed = parseEventBody(body.text);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: parsed.reason === "too_large" ? 413 : 400 });
  }

  const writesOff = writesOffResponse();
  if (writesOff) return writesOff;

  const { featureId, action, path } = parsed.event;
  try {
    if (!(await consumeRateLimit(hashClientIp(request.headers), "event", EVENT_RATE_LIMIT))) {
      return rateLimitedResponse(EVENT_RATE_LIMIT);
    }
    const { error } = await serviceSupabase().from("events").insert({ feature_id: featureId, action, path });
    if (error) throw new Error(error.message);
    return new Response(null, { status: 202 });
  } catch (error) {
    log.error("analytics: failed to record event", error, { featureId, action });
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
