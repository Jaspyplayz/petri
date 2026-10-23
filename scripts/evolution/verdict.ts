import { z } from "zod";
import { verifyStepSchema } from "../verify/steps";
import { defang } from "./triage-output";

const text = (max: number) => z.string().trim().min(1).max(max);

function jsonSchema(schema: z.ZodType): string {
  const value: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete value.$schema;
  return JSON.stringify(value);
}

// The planner turns each acceptance criterion into a verify script. A script, not the agent, writes the files.
export const verifyPlanSchema = z
  .object({
    scripts: z
      .array(
        z
          .object({
            criterion: z.number().int().min(1).max(5),
            name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
            description: text(300),
            steps: z.array(verifyStepSchema).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export type VerifyPlan = z.infer<typeof verifyPlanSchema>;

export const planJsonSchema = (): string => jsonSchema(verifyPlanSchema);

export const verdictSchema = z
  .object({
    verdict: z.enum(["pass", "fail"]),
    summary: text(600),
    criteria: z
      .array(
        z
          .object({
            criterion: z.number().int().min(1).max(5),
            score: z.number().int().min(1).max(10),
            passed: z.boolean(),
            evidence: z.array(z.string().regex(/^[\w./-]{1,200}$/)).max(10),
            note: text(400),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    scopeCreep: z.object({ found: z.boolean(), note: text(400) }).strict(),
  })
  .strict();

export type Verdict = z.infer<typeof verdictSchema>;

export const verdictJsonSchema = (): string => jsonSchema(verdictSchema);

export function planFiles(plan: VerifyPlan, criteriaCount: number): { file: string; json: string }[] {
  const outside = plan.scripts.filter((script) => script.criterion > criteriaCount);
  if (outside.length > 0) throw new Error(`the plan names criteria the issue doesn't have: ${outside.map((script) => String(script.criterion)).join(", ")}`);
  const missing = Array.from({ length: criteriaCount }, (_, index) => index + 1).filter((number) => !plan.scripts.some((script) => script.criterion === number));
  if (missing.length > 0) throw new Error(`the plan has no script for criteria ${missing.join(", ")}`);
  return plan.scripts.map((script, index) => ({
    file: `${String(index + 1).padStart(2, "0")}-c${String(script.criterion)}-${script.name}.json`,
    json: `${JSON.stringify({ description: `Criterion ${String(script.criterion)}: ${script.description}`, steps: script.steps }, null, 2)}\n`,
  }));
}

// The judge's word isn't enough on its own: every criterion of the issue must be scored and passed, and no scope creep.
export function finalVerdict(verdict: Verdict, criteriaCount: number): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (verdict.verdict !== "pass") reasons.push("the verifier's verdict is fail");
  for (let number = 1; number <= criteriaCount; number += 1) {
    const scored = verdict.criteria.find((criterion) => criterion.criterion === number);
    if (scored === undefined) reasons.push(`criterion ${String(number)} wasn't scored`);
    else if (!scored.passed) reasons.push(`criterion ${String(number)} failed (score ${String(scored.score)}/10)`);
  }
  if (verdict.scopeCreep.found) reasons.push("the diff does more than the issue asked for");
  return { passed: reasons.length === 0, reasons };
}

export const VERDICT_MARKER = "<!-- evolution-verify -->";

// The judge's text is shown as plain text: no links, images, HTML, headings or autolinked URLs it could be talked
// into adding. Markdown punctuation is backslash-escaped, and a zero-width space breaks URL schemes and "www.".
export function inert(value: string): string {
  return defang(value)
    .replace(/\r?\n/g, " ")
    .replace(/[\\`*_[\]()!<>#|~]/g, "\\$&")
    .replace(/\b([a-z][a-z0-9+.-]*):\/\//gi, "$1:​//")
    .replace(/\bwww\./gi, "www​.");
}

export function renderVerdictComment(input: {
  readonly verdict: Verdict;
  readonly criteria: readonly string[];
  readonly passed: boolean;
  readonly reasons: readonly string[];
  readonly runUrl: string;
  readonly sha: string;
}): string {
  const { verdict } = input;
  return [
    VERDICT_MARKER,
    `## evolution-verify: ${input.passed ? "✅ pass" : "❌ fail"}`,
    "",
    `Commit \`${input.sha.slice(0, 7)}\`, checked by an independent agent against the issue's acceptance criteria. Evidence (screenshots and reports): [workflow run](${input.runUrl}).`,
    "",
    inert(verdict.summary),
    "",
    "| # | Criterion | Score | Result | Note |",
    "|---|---|---|---|---|",
    ...input.criteria.map((criterion, index) => {
      const scored = verdict.criteria.find((item) => item.criterion === index + 1);
      const cell = inert;
      return scored === undefined
        ? `| ${String(index + 1)} | ${cell(criterion)} | – | not scored | |`
        : `| ${String(index + 1)} | ${cell(criterion)} | ${String(scored.score)}/10 | ${scored.passed ? "pass" : "fail"} | ${cell(scored.note)} |`;
    }),
    "",
    `**Scope:** ${verdict.scopeCreep.found ? "❌ " : ""}${inert(verdict.scopeCreep.note)}`,
    ...(input.reasons.length === 0 ? [] : ["", "Why it fails:", ...input.reasons.map((reason) => `- ${reason}`)]),
    "",
  ].join("\n");
}
