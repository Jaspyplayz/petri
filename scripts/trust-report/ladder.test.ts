import { describe, expect, it } from "vitest";
import { isRevert, ladder, levelStartedAt, renderReport, suggest, trustStats, type MergedPullRequest, type TrustStats } from "./ladder";

function pr(number: number, labels: string[], title = `feat: change ${String(number)}`, mergedAt = "2026-11-02T10:00:00Z"): MergedPullRequest {
  return { number, title, mergedAt, labels };
}

function stats(level: number, autoMerged: number, reverts: number, evolutionMerged = autoMerged): TrustStats {
  const numbers = (count: number, from: number): number[] => Array.from({ length: count }, (_, index) => from + index);
  return { level, since: "2026-11-01T00:00:00Z", evolutionMerged: numbers(evolutionMerged, 1), autoMerged: numbers(autoMerged, 1), reverts: numbers(reverts, 100) };
}

describe("ladder", () => {
  it("has levels 0 to 4 in order, and only level 4 has no promotion", () => {
    expect(ladder.map((rung) => rung.level)).toEqual([0, 1, 2, 3, 4]);
    expect(ladder.filter((rung) => rung.promotion === undefined).map((rung) => rung.level)).toEqual([4]);
  });
});

describe("levelStartedAt", () => {
  it("is the oldest commit of the newest run at the current level", () => {
    expect(
      levelStartedAt([
        { date: "2026-12-01", trustLevel: 2 },
        { date: "2026-11-20", trustLevel: 2 },
        { date: "2026-11-01", trustLevel: 1 },
        { date: "2026-10-01", trustLevel: 2 },
      ]),
    ).toBe("2026-11-20");
  });

  it("is the first commit when the level never changed, and unknown without history", () => {
    expect(levelStartedAt([{ date: "2026-10-23", trustLevel: 0 }])).toBe("2026-10-23");
    expect(levelStartedAt([])).toBeUndefined();
  });
});

describe("trustStats", () => {
  it("counts evolution PRs merged since the level began, auto-merged ones and reverts", () => {
    const result = trustStats(1, "2026-11-01T00:00:00Z", [
      pr(1, ["evolution"]),
      pr(2, ["evolution", "needs-human"]),
      pr(3, ["evolution"], "feat: old", "2026-10-30T00:00:00Z"),
      pr(4, []),
      pr(5, ["evolution", "evolution:revert"], "revert: blob wobble"),
      pr(6, [], 'Revert "feat(blob): wobble"'),
    ]);
    expect(result).toEqual({ level: 1, since: "2026-11-01T00:00:00Z", evolutionMerged: [1, 2], autoMerged: [1], reverts: [5, 6] });
  });

  it("counts everything when the level has no start date", () => {
    expect(trustStats(0, undefined, [pr(3, ["evolution"], "feat: old", "2020-01-01T00:00:00Z")]).evolutionMerged).toEqual([3]);
  });
});

describe("isRevert", () => {
  it("knows the guardian's label and git's revert title", () => {
    expect(isRevert(pr(1, ["evolution:revert"]))).toBe(true);
    expect(isRevert(pr(1, [], 'Revert "feat: x"'))).toBe(true);
    expect(isRevert(pr(1, [], "fix: revert the wobble speed"))).toBe(false);
  });
});

describe("suggest", () => {
  it("promotes 0 → 1 after 3 merged runs of the loop, even though a human merged them", () => {
    expect(suggest(stats(0, 0, 0, 2)).promoteTo).toBeUndefined();
    expect(suggest(stats(0, 0, 0, 3)).promoteTo).toBe(1);
  });

  it("promotes 1 → 2 only after 10 auto-merges and no revert", () => {
    expect(suggest(stats(1, 10, 0)).promoteTo).toBe(2);
    expect(suggest(stats(1, 10, 1))).toEqual({ promoteTo: undefined, reason: "not yet: 1 reverts (at most 0 allowed)" });
    expect(suggest(stats(1, 9, 0, 15)).reason).toBe("not yet: 9 of 10 evolution PRs auto-merged");
  });

  it("asks for a Sentry check before 2 → 3 and allows one revert", () => {
    const suggestion = suggest(stats(2, 20, 1));
    expect(suggestion.promoteTo).toBe(3);
    expect(suggestion.reason).toContain("Check Sentry by hand");
    expect(suggest(stats(2, 25, 2)).promoteTo).toBeUndefined();
  });

  it("never suggests past level 4 or for a level off the ladder", () => {
    expect(suggest(stats(3, 30, 1)).promoteTo).toBe(4);
    expect(suggest(stats(4, 100, 0))).toEqual({ promoteTo: undefined, reason: "level 4 is the top of the ladder" });
    expect(suggest(stats(7, 100, 0)).promoteTo).toBeUndefined();
  });
});

describe("renderReport", () => {
  it("shows the stats and says a human makes the change", () => {
    const current = stats(1, 10, 0);
    const report = renderReport(current, suggest(current));
    expect(report).toContain("## Trust report: level 1");
    expect(report).toContain("- **Auto-merged:** 10 (#1, #2, #3, #4, #5, #6, #7, #8, #9, #10)");
    expect(report).toContain("- **Reverts:** 0 (none)");
    expect(report).toContain("**Suggested: promote to level 2**");
    expect(report).toContain("a human sets `trustLevel` to 2 in `.evolution/config.json`");
  });

  it("explains why there's no promotion", () => {
    const current = { ...stats(0, 0, 0, 1), since: undefined };
    const report = renderReport(current, suggest(current));
    expect(report).toContain("- **Level since:** unknown");
    expect(report).toContain("No promotion: not yet: 1 of 3 evolution PRs merged (each one a full run of the loop).");
  });
});
