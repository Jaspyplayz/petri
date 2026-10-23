export type ConsoleEntry = { readonly type: string; readonly text: string; readonly url: string };

export type NetworkProblem = {
  readonly method: string;
  readonly url: string;
  readonly status: number | null;
  readonly failure: string | null;
};

export type A11yNode = { readonly target: string; readonly summary: string | null };

export type A11yViolation = {
  readonly id: string;
  readonly impact: string | null;
  readonly help: string;
  readonly nodes: readonly A11yNode[];
};

export type StepOutcome = {
  readonly number: number;
  readonly label: string;
  readonly screenshot: string | null;
  readonly ms: number;
  readonly error: string | null;
};

export type Observations = {
  readonly steps: readonly StepOutcome[];
  readonly console: readonly ConsoleEntry[];
  readonly pageErrors: readonly string[];
  readonly network: readonly NetworkProblem[];
  readonly a11y: readonly A11yViolation[];
  readonly brokenClassNames: readonly string[];
};

const failingImpacts = new Set(["serious", "critical"]);
const navigationAbort = "net::ERR_ABORTED";

export function failuresOf(observed: Observations): string[] {
  return [
    ...observed.steps.flatMap((step) => (step.error === null ? [] : [`step ${String(step.number)} (${step.label}): ${step.error}`])),
    ...observed.console.filter((entry) => entry.type === "error").map((entry) => `console.error: ${entry.text}`),
    ...observed.pageErrors.map((message) => `pageerror: ${message}`),
    ...observed.network.flatMap((problem) => {
      if (problem.status !== null && problem.status >= 400) return [`HTTP ${String(problem.status)} ${problem.method} ${problem.url}`];
      if (problem.failure !== null && problem.failure !== navigationAbort) {
        return [`request failed (${problem.failure}) ${problem.method} ${problem.url}`];
      }
      return [];
    }),
    ...observed.a11y
      .filter((violation) => violation.impact !== null && failingImpacts.has(violation.impact))
      .map((violation) => {
        const shown = violation.nodes.slice(0, 3).map((node) => node.target);
        const more = violation.nodes.length > 3 ? ` and ${String(violation.nodes.length - 3)} more` : "";
        const why = violation.nodes[0]?.summary;
        return `a11y ${String(violation.impact)}: ${violation.id} (${violation.help}) on ${shown.join(", ")}${more}${why ? `. ${why}` : ""}`;
      }),
    ...observed.brokenClassNames.map((element) => `class name contains "undefined" or "null": ${element}`),
  ];
}
