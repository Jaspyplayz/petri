import type { GuardrailsConfig } from "./config.ts";
import type { ChangedFile } from "./git.ts";
import { matchesAny } from "./glob.ts";
import { canonicalJson, type JsonRecord, parseJsonRecord } from "./json.ts";

export type Side = "base" | "head" | "tip";
export type FileReader = (side: Side, path: string) => string | undefined;

export type Violation = {
  readonly path: string;
  readonly reason: string;
};

const DEPENDENCY_MANIFESTS = new Set(["package.json", "pnpm-lock.yaml"]);

function sameExcept(before: JsonRecord, after: JsonRecord, allowed: (key: string) => boolean): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].every((key) => allowed(key) || canonicalJson(before[key]) === canonicalJson(after[key]));
}

function trustLevelOf(record: JsonRecord | undefined): number | undefined {
  const level = record?.trustLevel;
  return typeof level === "number" && Number.isInteger(level) && level >= 0 ? level : undefined;
}

function onlyTrustLowered(base: string | undefined, head: string | undefined): boolean {
  const before = parseJsonRecord(base);
  const after = parseJsonRecord(head);
  if (!before || !after) return false;
  const from = trustLevelOf(before);
  const to = trustLevelOf(after);
  return from !== undefined && to !== undefined && to < from && sameExcept(before, after, (key) => key === "trustLevel");
}

function pausedUntil(content: string | undefined): number | null | undefined {
  const record = parseJsonRecord(content);
  if (!record) return undefined;
  const until = record.until;
  if (until === null) return null;
  if (typeof until !== "string") return undefined;
  const timestamp = Date.parse(until);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function pauseKeptOrExtended(base: string | undefined, head: string | undefined): boolean {
  const after = pausedUntil(head);
  if (after === null) return true;
  const before = pausedUntil(base);
  return after !== undefined && typeof before === "number" && after >= before;
}

export function trustLevelAt(read: FileReader, config: GuardrailsConfig, side: Side): number {
  return trustLevelOf(parseJsonRecord(read(side, config.trustConfigPath))) ?? 0;
}

export function isProtectedPath(path: string, config: GuardrailsConfig): boolean {
  return matchesAny(path, config.protectedPaths, { ignoreCase: true });
}

function violationReason(change: ChangedFile, config: GuardrailsConfig, read: FileReader): string | undefined {
  const { path, status } = change;
  if (matchesAny(path, config.migrations.paths)) {
    const trustLevel = trustLevelAt(read, config, "tip");
    if (trustLevel < config.migrations.allowedFromTrustLevel) {
      return `database migrations need trust level ${String(config.migrations.allowedFromTrustLevel)} (current: ${String(trustLevel)})`;
    }
    return status === "added" ? undefined : "migrations are append-only: add a new migration instead of editing one";
  }
  if (DEPENDENCY_MANIFESTS.has(path)) {
    return "dependencies, scripts and the lockfile are guardrails: dependency changes need a human";
  }
  if (path === config.trustConfigPath) {
    return status === "modified" && onlyTrustLowered(read("base", path), read("head", path))
      ? undefined
      : `agents may only lower trustLevel in ${config.trustConfigPath}`;
  }
  if (path === config.pauseFilePath) {
    const allowed =
      status === "added" || (status === "modified" && pauseKeptOrExtended(read("base", path), read("head", path)));
    return allowed ? undefined : `agents may add or extend ${config.pauseFilePath}, never remove or shorten it`;
  }
  return "guardrail file: agents can't change their own guardrails";
}

export function protectedPathViolations(
  changes: readonly ChangedFile[],
  config: GuardrailsConfig,
  read: FileReader,
): Violation[] {
  return changes.flatMap((change) => {
    if (!isProtectedPath(change.path, config)) return [];
    const reason = violationReason(change, config, read);
    return reason === undefined ? [] : [{ path: change.path, reason }];
  });
}

export function baseBranchViolation(baseRef: string | undefined, defaultBranch: string | undefined): Violation | undefined {
  if (baseRef !== undefined && baseRef === defaultBranch) return undefined;
  return {
    path: `base branch ${baseRef ?? "(unknown)"}`,
    reason: `agent PRs target the default branch (${defaultBranch ?? "unknown"}) only, so the checks see the code they will land on`,
  };
}
