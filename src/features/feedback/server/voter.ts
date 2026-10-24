import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { serverEnv } from "@/shared/env";
import { feedbackIdSchema } from "../lib/feedback-input";

export const VOTER_COOKIE = "petri_voter";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type Voter = { readonly id: string; readonly isNew: boolean };

export function voterFromCookies(cookieHeader: string | null): Voter {
  const value = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${VOTER_COOKIE}=`))
    ?.slice(VOTER_COOKIE.length + 1);
  return value && feedbackIdSchema.safeParse(value).success ? { id: value, isNew: false } : { id: randomUUID(), isNew: true };
}

export function hashVoter(id: string): string {
  return createHash("sha256").update(`${serverEnv().RATE_LIMIT_SALT}:voter:${id}`).digest("hex");
}

export function voterCookie(id: string, secure: boolean): string {
  return `${VOTER_COOKIE}=${id}; Path=/; Max-Age=${String(ONE_YEAR_SECONDS)}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
