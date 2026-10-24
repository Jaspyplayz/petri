// An eval case is evals/<skill>/cases/<NN-name>/ with task.md (what the agent is asked), setup.sh (puts the repo copy in
// the case's starting state) and rubric.md (what a good run does, for the judge).
export const CASE_FILES = ["task.md", "setup.sh", "rubric.md"] as const;

export type EvalCase = { readonly skill: string; readonly id: string; readonly dir: string };

export function caseProblems(skill: string, id: string, files: readonly string[]): string[] {
  const problems = CASE_FILES.filter((file) => !files.includes(file)).map((file) => `evals/${skill}/cases/${id}: missing ${file}`);
  if (!/^\d{2}-[a-z0-9-]+$/.test(id)) problems.push(`evals/${skill}/cases/${id}: name it NN-kebab-case, like 01-reproduce-first`);
  return problems;
}

export function selectCases(cases: readonly EvalCase[], skills: readonly string[], maxPerSkill: number | undefined): EvalCase[] {
  const wanted = skills.length > 0 ? cases.filter((c) => skills.includes(c.skill)) : [...cases];
  const sorted = wanted.toSorted((a, b) => a.skill.localeCompare(b.skill) || a.id.localeCompare(b.id));
  if (maxPerSkill === undefined) return sorted;
  const taken = new Map<string, number>();
  return sorted.filter((c) => {
    const count = taken.get(c.skill) ?? 0;
    taken.set(c.skill, count + 1);
    return count < maxPerSkill;
  });
}
