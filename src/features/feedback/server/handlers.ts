import "server-only";
import { log } from "@/shared/lib/log";
import { readBodyWithLimit } from "@/shared/lib/read-body";
import { guardJsonWrite } from "@/shared/lib/request-guards";
import { writesOffResponse } from "@/shared/lib/writes-off-response";
import { consumeRateLimit, hashClientIp, rateLimitedResponse } from "@/shared/supabase/rate-limit";
import { serviceSupabase } from "@/shared/supabase/service-client";
import {
  MAX_REQUEST_BODY_BYTES,
  feedbackIdSchema,
  feedbackInputSchema,
  type FeedbackApiError,
} from "../lib/feedback-input";
import { RATE_LIMITS, VOTES_PER_NETWORK_PER_ITEM } from "../lib/rate-limits";
import { hashVoter, voterCookie, voterFromCookies } from "./voter";

function errorResponse(error: FeedbackApiError, status: number): Response {
  return Response.json({ error }, { status });
}

function voteResponse(outcome: string): Response {
  switch (outcome) {
    case "voted":
      return new Response(null, { status: 201 });
    case "already_voted":
      return Response.json({ alreadyVoted: true }, { status: 200 });
    case "ip_cap":
      return errorResponse("vote_limit", 409);
    case "not_found":
      return errorResponse("not_found", 404);
    default:
      throw new Error(`cast_vote returned ${outcome}`);
  }
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

  const writesOff = writesOffResponse();
  if (writesOff) return writesOff;

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

  const writesOff = writesOffResponse();
  if (writesOff) return writesOff;

  try {
    const ipHash = hashClientIp(request.headers);
    if (!(await consumeRateLimit(ipHash, "vote", RATE_LIMITS.vote))) return rateLimitedResponse(RATE_LIMITS.vote);

    const voter = voterFromCookies(request.headers.get("cookie"));
    const { data: outcome, error } = await serviceSupabase().rpc("cast_vote", {
      p_feedback_id: id.data,
      p_voter_hash: hashVoter(voter.id),
      p_ip_hash: ipHash,
      p_ip_cap: VOTES_PER_NETWORK_PER_ITEM,
    });
    if (error) throw new Error(error.message);
    const response = voteResponse(outcome);
    if (voter.isNew) response.headers.append("Set-Cookie", voterCookie(voter.id, new URL(request.url).protocol === "https:"));
    return response;
  } catch (error) {
    log.error("feedback: failed to vote", error, { feedbackId: id.data });
    return errorResponse("unavailable", 503);
  }
}
