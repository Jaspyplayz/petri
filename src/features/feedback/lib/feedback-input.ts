import { z } from "zod";

export const FEEDBACK_MAX_LENGTH = 280;
export const MAX_REQUEST_BODY_BYTES = 4096;

export const feedbackInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(FEEDBACK_MAX_LENGTH, `Keep it to ${String(FEEDBACK_MAX_LENGTH)} characters.`),
  category: z.enum(["idea", "bug"]),
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export const feedbackIdSchema = z.uuid();

export function charactersLeft(body: string): number {
  return FEEDBACK_MAX_LENGTH - body.trim().length;
}

export type FeedbackApiError = "invalid" | "too_large" | "rate_limited" | "not_found" | "unavailable";

export function feedbackErrorMessage(error: FeedbackApiError): string {
  switch (error) {
    case "invalid":
      return "That doesn't look right. Check the text and category.";
    case "too_large":
      return "That request is too big.";
    case "rate_limited":
      return "You're going a bit fast. Try again later.";
    case "not_found":
      return "That feedback no longer exists.";
    case "unavailable":
      return "Something went wrong on our side. Try again in a moment.";
  }
}

const apiErrorSchema = z.object({
  error: z.enum(["invalid", "too_large", "rate_limited", "not_found", "unavailable"]),
});

export function parseFeedbackApiError(json: unknown): FeedbackApiError {
  const parsed = apiErrorSchema.safeParse(json);
  return parsed.success ? parsed.data.error : "unavailable";
}
