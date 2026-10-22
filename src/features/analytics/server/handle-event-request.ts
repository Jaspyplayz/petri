import "server-only";
import { log } from "@/shared/lib/log";
import { readBodyWithLimit } from "@/shared/lib/read-body";
import { serviceSupabase } from "@/shared/supabase/service-client";
import { MAX_EVENT_BODY_BYTES, parseEventBody } from "../lib/event-payload";

export async function handleEventRequest(request: Request): Promise<Response> {
  const body = await readBodyWithLimit(request, MAX_EVENT_BODY_BYTES);
  if (!body.ok) return Response.json({ error: body.reason }, { status: 413 });

  const parsed = parseEventBody(body.text);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: parsed.reason === "too_large" ? 413 : 400 });
  }

  const { featureId, action, path } = parsed.event;
  const { error } = await serviceSupabase().from("events").insert({ feature_id: featureId, action, path });
  if (error) {
    log.error("analytics: failed to record event", error, { featureId, action });
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  return new Response(null, { status: 202 });
}
