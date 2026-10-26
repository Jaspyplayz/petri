import { z } from "zod";
import { defang, type TriageIssue } from "./triage-output";

const text = (max: number) => z.string().trim().min(1).max(max);

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug === "" ? "change" : slug;
}

export function branchName(issueNumber: number, title: string): string {
  return `evo/${String(issueNumber)}-${slugify(title)}`;
}

// The builder's structured output: what goes in the PR body. The script runs the gates and verify itself.
export const builderReportSchema = z
  .object({
    outcome: z.enum(["done", "blocked"]),
    blockedReason: z.string().trim().max(600).optional(),
    reproduction: text(600),
    whatChanged: z.array(text(300)).min(1).max(10),
    flows: z
      .array(z.string().regex(/^[a-z][a-z0-9-]*\.[a-zA-Z][a-zA-Z0-9-]*$/))
      .min(1)
      .max(5),
    risk: text(400),
    rollback: text(300),
  })
  .strict();

export type BuilderReport = z.infer<typeof builderReportSchema>;

export function builderJsonSchema(): string {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(builderReportSchema) };
  delete schema.$schema;
  return JSON.stringify(schema);
}

export type BuiltIssue = TriageIssue & { readonly number: number; readonly url: string };

// artifacts/evolution/issue.json, what the builder, the verify planner and the judge read. It leaves out the later
// steps and the note for visitors, so they build and judge this step's acceptance criteria and nothing more.
export type IssueJson = Omit<BuiltIssue, "laterSteps" | "changedMeaning">;

export function renderIssueJson(issue: BuiltIssue): string {
  const fields: IssueJson = {
    title: issue.title,
    userStory: issue.userStory,
    acceptanceCriteria: issue.acceptanceCriteria,
    featureId: issue.featureId,
    riskLevel: issue.riskLevel,
    feedbackIds: issue.feedbackIds,
    number: issue.number,
    url: issue.url,
  };
  return `${JSON.stringify(fields, null, 2)}\n`;
}

export const PR_DATA_PREFIX = "<!-- evolution-pr:v1 ";

export const prDataSchema = z
  .object({
    issueNumber: z.number().int().positive(),
    featureId: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    feedbackIds: z.array(z.uuid()),
    before: z.array(z.url()),
    after: z.array(z.url()),
  })
  .strict();

export type PrData = z.infer<typeof prDataSchema>;

export function prTitle(issue: BuiltIssue): string {
  return `feat(${issue.featureId}): ${issue.title}`.slice(0, 100);
}

export type PrBodyInput = {
  readonly issue: BuiltIssue;
  readonly report: BuilderReport;
  readonly verifySummary: string;
  readonly compareSummary: string;
  readonly before: readonly string[];
  readonly after: readonly string[];
};

function images(label: string, urls: readonly string[]): string[] {
  return urls.map((url, index) => `![${label} ${String(index + 1)}](${url})`);
}

// The sections of .github/pull_request_template.md, filled from the issue, the builder's report and verify's output.
export function renderPrBody(input: PrBodyInput): string {
  const { issue } = input;
  const report = {
    ...input.report,
    reproduction: defang(input.report.reproduction),
    whatChanged: input.report.whatChanged.map(defang),
    risk: defang(input.report.risk),
    rollback: defang(input.report.rollback),
  };
  const data: PrData = {
    issueNumber: issue.number,
    featureId: issue.featureId,
    riskLevel: issue.riskLevel,
    feedbackIds: [...issue.feedbackIds],
    before: [...input.before],
    after: [...input.after],
  };
  return [
    "## Why",
    "",
    `Closes #${String(issue.number)}. Feedback: ${issue.feedbackIds.map((id) => `\`${id}\``).join(", ")}.`,
    "",
    issue.userStory,
    "",
    `Reproduced before the change: ${report.reproduction}`,
    "",
    "## What changed",
    "",
    ...report.whatChanged.map((line) => `- ${line}`),
    "",
    "## Feature(s) touched",
    "",
    `\`${issue.featureId}\``,
    "",
    "## Verification report + screenshots",
    "",
    `\`pnpm check\` passed. Flows the builder ran for this issue: ${report.flows.map((flow) => `\`${flow}\``).join(", ")}.`,
    "",
    "<details><summary>pnpm verify:all</summary>",
    "",
    input.verifySummary.trim(),
    "",
    "</details>",
    "",
    "<details><summary>pnpm verify:compare origin/main</summary>",
    "",
    input.compareSummary.trim(),
    "",
    "</details>",
    "",
    ...(input.before.length + input.after.length === 0 ? ["No screenshots."] : [...images("Before", input.before), ...images("After", input.after)]),
    "",
    "## Risk",
    "",
    `riskLevel: ${issue.riskLevel}. ${report.risk}`,
    "",
    "## Rollback",
    "",
    report.rollback,
    "",
    `${PR_DATA_PREFIX}${JSON.stringify(data)} -->`,
    "",
  ].join("\n");
}

export function prDataFromBody(body: string): PrData | undefined {
  const start = body.lastIndexOf(PR_DATA_PREFIX);
  if (start === -1) return undefined;
  const end = body.indexOf(" -->", start);
  if (end === -1) return undefined;
  try {
    const parsed = prDataSchema.safeParse(JSON.parse(body.slice(start + PR_DATA_PREFIX.length, end)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
