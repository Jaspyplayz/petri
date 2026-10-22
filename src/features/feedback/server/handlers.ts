import "server-only";
import { log } from "@/shared/lib/log";
import { readBodyWithLimit } from "@/shared/lib/read-body";
import { guardJsonWrite } from "@/shared/lib/request-guards";
import { consumeRateLimit, hashClientIp, rateLimitedResponse } from "@/shared/supabase/rate-limit";
import { serviceSupabase } from "@/shared/supabase/service-client";
import {
  MAX_REQUEST_BODY_BYTES,
  feedbackIdSchema,
  feedbackInputSchema,
  type FeedbackApiError,
} from "../lib/feedback-input";
import { RATE_LIMITS } from "../lib/rate-limits";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

function errorResponse(error: FeedbackApiError, status: number): Response {
  return Response.json({ error }, { status });
}

async function readJson(request: Request): Promise<{ ok: true; json: unknown } | { ok: false; response: Response }> {
  const guard = guardJsonWrite(request);
  if (guard) return { ok: false, response: Response.json({ error: guard.error }, { status: guard.status }) };
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
    if (!(await consumeRateLimit(ipHash, "post", RATE_LIMITS.post))) return rateLimitedResponse(RATE_LIMITS.post);

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
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const id = feedbackIdSchema.safeParse(rawId);
  if (!id.success) return errorResponse("not_found", 404);

  try {
    const voterHash = hashClientIp(request.headers);
    if (!(await consumeRateLimit(voterHash, "vote", RATE_LIMITS.vote))) return rateLimitedResponse(RATE_LIMITS.vote);

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
