import type { NumstatEntry } from "./git.ts";
import { matchesAny } from "./glob.ts";

export type SizeReport = {
  readonly total: number;
  readonly counted: readonly { readonly path: string; readonly lines: number }[];
  readonly ignored: readonly string[];
  readonly binary: readonly string[];
};

export function measurePullRequest(entries: readonly NumstatEntry[], ignoredPaths: readonly string[]): SizeReport {
  const counted: { path: string; lines: number }[] = [];
  const ignored: string[] = [];
  const binary: string[] = [];
  for (const entry of entries) {
    if (matchesAny(entry.path, ignoredPaths)) ignored.push(entry.path);
    else if (entry.added === null || entry.deleted === null) binary.push(entry.path);
    else counted.push({ path: entry.path, lines: entry.added + entry.deleted });
  }
  counted.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  return { total: counted.reduce((sum, file) => sum + file.lines, 0), counted, ignored, binary };
}
