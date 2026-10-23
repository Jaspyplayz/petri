export type Promotion = { readonly pullRequests: number; readonly maxReverts: number | undefined; readonly sentryClean: boolean };

export type Rung = { readonly level: number; readonly autoMerges: string; readonly promotion: Promotion | undefined };

// The trust ladder from CLAUDE.md. Level 4 has no promotion: going further is a human decision.
export const ladder: readonly Rung[] = [
  { level: 0, autoMerges: "nothing (a human merges every PR)", promotion: { pullRequests: 3, maxReverts: undefined, sentryClean: false } },
  { level: 1, autoMerges: "`riskLevel: low` changes inside one existing feature folder", promotion: { pullRequests: 10, maxReverts: 0, sentryClean: false } },
  { level: 2, autoMerges: "new features from the generator; changes inside any single feature", promotion: { pullRequests: 20, maxReverts: 1, sentryClean: true } },
  { level: 3, autoMerges: "`src/shared/`, several features, allow-listed dependencies", promotion: { pullRequests: 30, maxReverts: 1, sentryClean: false } },
  { level: 4, autoMerges: "additive Supabase migrations", promotion: undefined },
];

export const EVOLUTION_LABEL = "evolution";
export const NEEDS_HUMAN_LABEL = "needs-human";
export const REVERT_LABEL = "evolution:revert";

export type MergedPullRequest = { readonly number: number; readonly title: string; readonly mergedAt: string; readonly labels: readonly string[] };

export type ConfigVersion = { readonly date: string; readonly trustLevel: number | undefined };

export type TrustStats = {
  readonly level: number;
  readonly since: string | undefined;
  readonly evolutionMerged: readonly number[];
  readonly autoMerged: readonly number[];
  readonly reverts: readonly number[];
};

export type Suggestion = { readonly promoteTo: number | undefined; readonly reason: string };

// versions is newest first. The level began at the oldest commit of the newest run of versions that share it.
export function levelStartedAt(versions: readonly ConfigVersion[]): string | undefined {
  const [newest, ...older] = versions;
  if (newest === undefined) return undefined;
  let started = newest.date;
  for (const version of older) {
    if (version.trustLevel !== newest.trustLevel) break;
    started = version.date;
  }
  return started;
}

export function isRevert(pr: MergedPullRequest): boolean {
  return pr.labels.includes(REVERT_LABEL) || /^Revert "/.test(pr.title);
}

export function trustStats(level: number, since: string | undefined, merged: readonly MergedPullRequest[]): TrustStats {
  const window = merged.filter((pr) => since === undefined || Date.parse(pr.mergedAt) >= Date.parse(since));
  const evolution = window.filter((pr) => pr.labels.includes(EVOLUTION_LABEL) && !isRevert(pr));
  return {
    level,
    since,
    evolutionMerged: evolution.map((pr) => pr.number),
    autoMerged: evolution.filter((pr) => !pr.labels.includes(NEEDS_HUMAN_LABEL)).map((pr) => pr.number),
    reverts: window.filter(isRevert).map((pr) => pr.number),
  };
}

export function suggest(stats: TrustStats): Suggestion {
  const rung = ladder.find((candidate) => candidate.level === stats.level);
  if (rung === undefined) return { promoteTo: undefined, reason: `trust level ${String(stats.level)} isn't on the ladder (0 to 4)` };
  const { promotion } = rung;
  if (promotion === undefined) return { promoteTo: undefined, reason: "level 4 is the top of the ladder" };
  // Level 0 merges by hand, so it counts the loop's merged PRs; the others count the PRs that merged themselves.
  const counted = stats.level === 0 ? stats.evolutionMerged.length : stats.autoMerged.length;
  const what = stats.level === 0 ? "evolution PRs merged (each one a full run of the loop)" : "evolution PRs auto-merged";
  const short = [
    ...(counted < promotion.pullRequests ? [`${String(counted)} of ${String(promotion.pullRequests)} ${what}`] : []),
    ...(promotion.maxReverts !== undefined && stats.reverts.length > promotion.maxReverts
      ? [`${String(stats.reverts.length)} reverts (at most ${String(promotion.maxReverts)} allowed)`]
      : []),
  ];
  if (short.length > 0) return { promoteTo: undefined, reason: `not yet: ${short.join("; ")}` };
  const sentry = promotion.sentryClean ? " Check Sentry by hand first: it needs no new unhandled issues since this level began." : "";
  return {
    promoteTo: stats.level + 1,
    reason: `${String(counted)} ${what} and ${String(stats.reverts.length)} reverts at level ${String(stats.level)}.${sentry}`,
  };
}

function prList(numbers: readonly number[]): string {
  return numbers.length === 0 ? "none" : numbers.map((number) => `#${String(number)}`).join(", ");
}

export function renderReport(stats: TrustStats, suggestion: Suggestion): string {
  const next = ladder.find((rung) => rung.level === suggestion.promoteTo);
  return [
    `## Trust report: level ${String(stats.level)}`,
    "",
    `- **Level since:** ${stats.since ?? "unknown (`.evolution/config.json` has no history)"}`,
    `- **Evolution PRs merged:** ${String(stats.evolutionMerged.length)} (${prList(stats.evolutionMerged)})`,
    `- **Auto-merged:** ${String(stats.autoMerged.length)} (${prList(stats.autoMerged)})`,
    `- **Reverts:** ${String(stats.reverts.length)} (${prList(stats.reverts)})`,
    "",
    next === undefined
      ? `No promotion: ${suggestion.reason}.`
      : `**Suggested: promote to level ${String(next.level)}** (${next.autoMerges}). ${suggestion.reason} This report never changes the level: a human sets \`trustLevel\` to ${String(next.level)} in \`.evolution/config.json\` in a PR of their own.`,
    "",
  ].join("\n");
}
