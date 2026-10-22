import "server-only";
import { log } from "@/shared/lib/log";
import { readBodyWithLimit } from "@/shared/lib/read-body";
import { serviceSupabase } from "@/shared/supabase/service-client";
import {
  MAX_REQUEST_BODY_BYTES,
  feedbackIdSchema,
  feedbackInputSchema,
  type FeedbackApiError,
} from "../lib/feedback-input";
import { RATE_LIMITS, type RateLimitedAction } from "../lib/rate-limits";
import { consumeRateLimit, hashClientIp } from "./rate-limit";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

function errorResponse(error: FeedbackApiError, status: number, headers: HeadersInit = {}): Response {
  return Response.json({ error }, { status, headers });
}

function rateLimitedResponse(action: RateLimitedAction): Response {
  return errorResponse("rate_limited", 429, { "Retry-After": String(RATE_LIMITS[action].windowSeconds) });
}

async function readJson(request: Request): Promise<{ ok: true; json: unknown } | { ok: false; response: Response }> {
  const body = await readBodyWithLimit(request, MAX_REQUEST_BODY_BYTES);
  if (!body.ok) return { ok: false, response: errorResponse("too_large", 413) };
  try {
    return { ok: true, json: JSON.parse(body.text) };
  } catch {
    return { ok: false, response: errorResponse("invalid", 400) };
  }
}

export async function handleCreateFeedback(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const input = feedbackInputSchema.safeParse(body.json);
  if (!input.success) return errorResponse("invalid", 400);

  try {
    const ipHash = hashClientIp(request.headers);
    if (!(await consumeRateLimit(ipHash, "post"))) return rateLimitedResponse("post");

    const { data, error } = await serviceSupabase()
      .from("feedback")
      .insert({ body: input.data.body, category: input.data.category, author_hash: ipHash })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ id: data.id }, { status: 201 });
  } catch (error) {
    log.error("feedback: failed to create", error);
    return errorResponse("unavailable", 503);
  }
}

export async function handleVote(request: Request, rawId: string): Promise<Response> {
  const id = feedbackIdSchema.safeParse(rawId);
  if (!id.success) return errorResponse("not_found", 404);

  try {
    const voterHash = hashClientIp(request.headers);
    if (!(await consumeRateLimit(voterHash, "vote"))) return rateLimitedResponse("vote");

    const { error } = await serviceSupabase().from("votes").insert({ feedback_id: id.data, voter_hash: voterHash });
    if (error?.code === UNIQUE_VIOLATION) return Response.json({ alreadyVoted: true }, { status: 200 });
    if (error?.code === FOREIGN_KEY_VIOLATION) return errorResponse("not_found", 404);
    if (error) throw new Error(error.message);
    return new Response(null, { status: 201 });
  } catch (error) {
    log.error("feedback: failed to vote", error, { feedbackId: id.data });
    return errorResponse("unavailable", 503);
  }
}
