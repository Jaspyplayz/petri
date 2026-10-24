export const REPORTS_TO_HIDE = 3;

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export type ReportOutcome = "reported" | "already_reported" | "not_found";

export function reportOutcome(insertErrorCode: string | undefined): ReportOutcome | undefined {
  if (insertErrorCode === undefined) return "reported";
  if (insertErrorCode === UNIQUE_VIOLATION) return "already_reported";
  if (insertErrorCode === FOREIGN_KEY_VIOLATION) return "not_found";
  return undefined;
}
