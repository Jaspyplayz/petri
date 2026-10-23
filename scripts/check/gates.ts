export type Gate = { readonly name: string; readonly script: string };

export type GateResult = { readonly gate: Gate; readonly ok: boolean; readonly seconds: number };

// The CI gates that need nothing but the checkout. CI also runs build, e2e and secrets: pnpm verify builds
// the app, e2e needs the local database, and gitleaks runs in the pre-commit hook.
export const gates: readonly Gate[] = [
  { name: "typecheck", script: "typecheck" },
  { name: "lint", script: "lint" },
  { name: "boundaries", script: "boundaries" },
  { name: "features", script: "features" },
  { name: "featuremap", script: "featuremap:check" },
  { name: "unit", script: "test:coverage" },
];

export function pnpmInvocation(execPath: string | undefined, args: readonly string[]): { command: string; args: string[] } {
  if (execPath === undefined || execPath === "") return { command: "pnpm", args: [...args] };
  return /\.[cm]?js$/.test(execPath) ? { command: process.execPath, args: [execPath, ...args] } : { command: execPath, args: [...args] };
}

export function summary(results: readonly GateResult[]): { text: string; ok: boolean } {
  const lines = results.map(({ gate, ok, seconds }) => `${ok ? "✔" : "✖"} ${gate.name} (pnpm ${gate.script}, ${seconds.toFixed(1)} s)`);
  const failed = results.filter((result) => !result.ok).map((result) => result.gate.name);
  const verdict =
    failed.length === 0
      ? `check: ok (${String(results.length)} gates)`
      : `check: ${String(failed.length)} of ${String(results.length)} gates failed: ${failed.join(", ")}. Fix them before you open the PR; CI runs the same commands.`;
  return { text: [...lines, "", verdict].join("\n"), ok: failed.length === 0 };
}
