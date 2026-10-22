import { z } from "zod";

export const MAX_EVENT_BODY_BYTES = 1024;

const slug = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);

export const eventPayloadSchema = z.object({
  featureId: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  action: slug,
  path: z
    .string()
    .min(1)
    .max(200)
    .regex(/^\/[^\s?#]*$/),
});

export type EventPayload = z.infer<typeof eventPayloadSchema>;

export type ParseEventResult =
  | { readonly ok: true; readonly event: EventPayload }
  | { readonly ok: false; readonly reason: "too_large" | "invalid_json" | "invalid_event" };

export function parseEventBody(rawBody: string): ParseEventResult {
  if (new TextEncoder().encode(rawBody).byteLength > MAX_EVENT_BODY_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const parsed = eventPayloadSchema.safeParse(json);
  return parsed.success ? { ok: true, event: parsed.data } : { ok: false, reason: "invalid_event" };
}
