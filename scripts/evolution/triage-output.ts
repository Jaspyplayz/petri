import { z } from "zod";
import type { RiskLevel } from "../../src/shared/lib/feature-manifest";

const text = (max: number) => z.string().trim().min(1).max(max);

export const rejectionReasons = ["unsafe", "off_topic", "needs_secrets_or_payments", "too_big", "unclear"] as const;

export const triageIssueSchema = z
  .object({
    title: text(80),
    userStory: text(400),
    acceptanceCriteria: z
      .array(z.object({ criterion: text(200), verify: z.array(text(200)).min(1).max(8) }).strict())
      .min(1)
      .max(5),
    featureId: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    riskLevel: z.enum(["low", "medium", "high"]),
    feedbackIds: z.array(z.uuid()).min(1).max(10),
    laterSteps: z.array(text(200)).max(4).default([]),
  })
  .strict();

export const triageOutputSchema = z
  .object({
    issues: z.array(triageIssueSchema).max(10),
    rejected: z.array(z.object({ feedbackId: z.uuid(), reason: z.enum(rejectionReasons), note: text(200) }).strict()).max(50),
  })
  .strict();

export type TriageIssue = z.infer<typeof triageIssueSchema>;
export type TriageOutput = z.infer<typeof triageOutputSchema>;
export type Rejection = TriageOutput["rejected"][number];

// The schema the triage agent's --json-schema gets, so its structured output is checked before we parse it again.
// It drops the "$schema" key so the value has no "$" when it's passed through claude_args.
export function triageJsonSchema(): string {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(triageOutputSchema) };
  delete schema.$schema;
  return JSON.stringify(schema);
}

export type IssuePlan = { readonly issues: readonly TriageIssue[]; readonly rejected: readonly Rejection[]; readonly problems: readonly string[] };

export const RISK_ORDER: readonly RiskLevel[] = ["low", "medium", "high"];

function higherRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

// The agent's text ends up in public issues: never let it @-mention anyone or close an HTML comment.
export function defang(value: string): string {
  return value.replace(/@(?=[A-Za-z0-9-])/g, "@​").replaceAll("-->", "--​>");
}

function defangIssue(issue: TriageIssue, riskLevel: RiskLevel, feedbackIds: string[]): TriageIssue {
  return {
    ...issue,
    title: defang(issue.title),
    userStory: defang(issue.userStory),
    acceptanceCriteria: issue.acceptanceCriteria.map((item) => ({ criterion: defang(item.criterion), verify: item.verify.map(defang) })),
    riskLevel,
    feedbackIds,
    laterSteps: issue.laterSteps.map(defang),
  };
}

const MAX_STEPS_PER_FEEDBACK = 5;

// The script, not the agent, decides what becomes an issue: known features only, feedback ids from the input only,
// each id used once, risk never below the feature's manifest, at most maxIssues, and at most MAX_STEPS_PER_FEEDBACK
// steps for a feedback item (stepsBuilt counts the ones already on the Timeline).
export function planIssues(
  output: TriageOutput,
  options: { candidateIds: ReadonlySet<string>; featureRisk: ReadonlyMap<string, RiskLevel>; stepsBuilt: ReadonlyMap<string, number>; maxIssues: number },
): IssuePlan {
  const used = new Set<string>();
  const problems: string[] = [];
  const issues: TriageIssue[] = [];
  for (const issue of output.issues) {
    const manifestRisk = options.featureRisk.get(issue.featureId);
    if (manifestRisk === undefined) {
      problems.push(`dropped "${issue.title}": no feature "${issue.featureId}"`);
      continue;
    }
    const ids = issue.feedbackIds.filter((id) => options.candidateIds.has(id) && !used.has(id));
    const unknown = issue.feedbackIds.filter((id) => !options.candidateIds.has(id));
    if (unknown.length > 0) problems.push(`"${issue.title}": ignored feedback id(s) that weren't in the input: ${unknown.join(", ")}`);
    if (ids.length === 0) {
      problems.push(`dropped "${issue.title}": none of its feedback ids are new and unused`);
      continue;
    }
    if (issues.length >= options.maxIssues) {
      problems.push(`left "${issue.title}" for the next triage: maxIssuesPerTriage is ${String(options.maxIssues)}`);
      continue;
    }
    for (const id of ids) used.add(id);
    const lastStep = ids.find((id) => (options.stepsBuilt.get(id) ?? 0) >= MAX_STEPS_PER_FEEDBACK - 1);
    if (lastStep !== undefined && issue.laterSteps.length > 0) {
      problems.push(
        `cleared the later steps of "${issue.title}": feedback ${lastStep} already has ${String(options.stepsBuilt.get(lastStep))} built steps, and a feedback item gets at most ${String(MAX_STEPS_PER_FEEDBACK)}`,
      );
    }
    issues.push(defangIssue(lastStep === undefined ? issue : { ...issue, laterSteps: [] }, higherRisk(issue.riskLevel, manifestRisk), ids));
  }
  const rejected: Rejection[] = [];
  for (const rejection of output.rejected) {
    if (!options.candidateIds.has(rejection.feedbackId) || used.has(rejection.feedbackId)) {
      problems.push(`ignored the rejection of ${rejection.feedbackId}: it isn't in the input or is already in an issue`);
      continue;
    }
    used.add(rejection.feedbackId);
    rejected.push({ ...rejection, note: defang(rejection.note) });
  }
  return { issues, rejected, problems };
}

export const ISSUE_DATA_PREFIX = "<!-- evolution-issue:v1 ";

export function renderIssueBody(issue: TriageIssue): string {
  return [
    "## User story",
    "",
    issue.userStory,
    "",
    "## Acceptance criteria (verification steps)",
    "",
    ...issue.acceptanceCriteria.flatMap((item, index) => [
      `${String(index + 1)}. **${item.criterion}**`,
      ...item.verify.map((step) => `   - ${step}`),
    ]),
    "",
    `- **Target feature:** \`${issue.featureId}\` (see FEATURE_MAP.md)`,
    `- **Risk level:** ${issue.riskLevel}`,
    `- **Linked feedback:** ${issue.feedbackIds.map((id) => `\`${id}\``).join(", ")}`,
    "",
    ...(issue.laterSteps.length === 0
      ? []
      : ["## Later steps", "", "Triage files these as later issues, one at a time, after this one ships.", "", ...issue.laterSteps.map((step) => `- ${step}`), ""]),
    "Created by evolution-triage. The build agent reads only the fields in the data comment below.",
    "",
    `${ISSUE_DATA_PREFIX}${JSON.stringify(issue)} -->`,
    "",
  ].join("\n");
}

export function issueFromBody(body: string): TriageIssue | undefined {
  const start = body.lastIndexOf(ISSUE_DATA_PREFIX);
  if (start === -1) return undefined;
  const end = body.indexOf(" -->", start);
  if (end === -1) return undefined;
  try {
    const parsed = triageIssueSchema.safeParse(JSON.parse(body.slice(start + ISSUE_DATA_PREFIX.length, end)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
