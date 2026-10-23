import type { A11yViolation, ConsoleEntry, NetworkProblem, StepOutcome } from "./problems";

export type Vitals = { readonly url: string; readonly lcpMs: number | null; readonly cls: number };

export type VerifyReport = {
  readonly name: string;
  readonly description: string;
  readonly baseUrl: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly steps: readonly StepOutcome[];
  readonly console: readonly ConsoleEntry[];
  readonly pageErrors: readonly string[];
  readonly network: readonly NetworkProblem[];
  readonly a11y: readonly A11yViolation[];
  readonly vitals: readonly Vitals[];
  readonly brokenClassNames: readonly string[];
};

export function runFolderName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function cell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function list(items: readonly string[], none: string): string[] {
  return items.length === 0 ? [none] : items.map((item) => `- ${cell(item)}`);
}

export function renderReport(report: VerifyReport): string {
  const notable = report.console.filter((entry) => entry.type === "error" || entry.type === "warning");
  return [
    `# ${report.passed ? "PASS" : "FAIL"} ${report.name}`,
    "",
    report.description,
    "",
    `- Base URL: ${report.baseUrl}`,
    `- Started: ${report.startedAt} · ${String(report.steps.length)} steps · ${seconds(report.durationMs)}`,
    "",
    "## Failures",
    "",
    ...list(report.failures, "None."),
    "",
    "## Steps",
    "",
    "| # | Step | Result | Screenshot |",
    "|---|---|---|---|",
    ...report.steps.map(
      (step) =>
        `| ${String(step.number)} | ${cell(step.label)} | ${step.error === null ? "ok" : `**failed:** ${cell(step.error)}`} (${String(step.ms)} ms) | ${
          step.screenshot === null ? "none" : `[${step.screenshot}](${step.screenshot})`
        } |`,
    ),
    "",
    "## Console",
    "",
    `${String(report.console.length)} messages, ${String(notable.length)} errors or warnings.`,
    "",
    ...notable.map((entry) => `- ${entry.type}: ${cell(entry.text)}`),
    ...(notable.length > 0 ? [""] : []),
    "## Network",
    "",
    ...list(
      report.network.map((problem) => `${problem.method} ${problem.url}: ${problem.status === null ? String(problem.failure) : `HTTP ${String(problem.status)}`}`),
      "No responses ≥ 400 and no failed requests.",
    ),
    "",
    "## Accessibility (axe)",
    "",
    ...(report.a11y.length === 0
      ? ["No violations."]
      : [
          "| Rule | Impact | Element | Why |",
          "|---|---|---|---|",
          ...report.a11y.flatMap((violation) =>
            violation.nodes.map(
              (node) => `| ${violation.id} | ${violation.impact ?? "unknown"} | \`${cell(node.target)}\` | ${cell(node.summary ?? violation.help)} |`,
            ),
          ),
        ]),
    "",
    "## Web Vitals",
    "",
    "| Page | LCP | CLS |",
    "|---|---|---|",
    ...report.vitals.map((vitals) => `| ${cell(vitals.url)} | ${vitals.lcpMs === null ? "n/a" : `${String(vitals.lcpMs)} ms`} | ${String(vitals.cls)} |`),
    "",
  ].join("\n");
}

export function renderSummary(reports: readonly { readonly folder: string; readonly report: VerifyReport }[]): string {
  const passed = reports.filter(({ report }) => report.passed).length;
  return [
    `# ${passed === reports.length ? "PASS" : "FAIL"} verify:all (${String(passed)}/${String(reports.length)} flows passed)`,
    "",
    "| Flow | Result | Steps | Time | Report |",
    "|---|---|---|---|---|",
    ...reports.map(
      ({ folder, report }) =>
        `| ${report.name} | ${report.passed ? "pass" : `**fail** (${String(report.failures.length)})`} | ${String(report.steps.length)} | ${seconds(report.durationMs)} | [report.md](${folder}/report.md) |`,
    ),
    "",
    ...reports.flatMap(({ report }) =>
      report.passed ? [] : [`## ${report.name}`, "", ...report.failures.map((failure) => `- ${cell(failure)}`), ""],
    ),
  ].join("\n");
}
