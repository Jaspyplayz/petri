// One line of evals/results.jsonl per case run, and the table `pnpm evals:report` prints from them.
export type EvalResult = {
  readonly date: string;
  readonly runId: string;
  readonly skill: string;
  readonly case: string;
  readonly subjectModel: string;
  readonly judgeModel: string;
  readonly score: number;
  readonly passed: boolean;
  readonly ranVerify: boolean;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly commit: string;
  readonly summary: string;
};

export function parseResults(text: string): EvalResult[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as EvalResult);
}

export function formatReport(results: readonly EvalResult[]): string {
  if (results.length === 0) return "No eval results yet. Run pnpm evals.\n";
  const latest = new Map<string, EvalResult>();
  const runs = new Map<string, number>();
  for (const result of results) {
    const key = `${result.skill}/${result.case}`;
    runs.set(key, (runs.get(key) ?? 0) + 1);
    const previous = latest.get(key);
    if (!previous || previous.date <= result.date) latest.set(key, result);
  }
  const rows = [...latest.entries()].toSorted(([a], [b]) => a.localeCompare(b));
  const lines = [
    "| Skill | Case | Latest score | Passed | Ran verify | Runs | Model | Date |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(([key, r]) => `| ${r.skill} | ${r.case} | ${String(r.score)}/10 | ${r.passed ? "yes" : "no"} | ${r.ranVerify ? "yes" : "no"} | ${String(runs.get(key))} | ${r.subjectModel} | ${r.date.slice(0, 10)} |`),
  ];
  const bySkill = new Map<string, number[]>();
  for (const [, r] of rows) bySkill.set(r.skill, [...(bySkill.get(r.skill) ?? []), r.score]);
  const averages = [...bySkill.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([skill, scores]) => `- ${skill}: ${(scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1)}/10 over ${String(scores.length)} case(s)`);
  return `${lines.join("\n")}\n\nAverage of the latest scores:\n${averages.join("\n")}\n`;
}
