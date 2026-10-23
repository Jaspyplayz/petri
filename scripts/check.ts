import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { gates, pnpmInvocation, summary, type GateResult } from "./check/gates";

const root = join(import.meta.dirname, "..");

function main(): void {
  const results: GateResult[] = gates.map((gate) => {
    process.stdout.write(`\n▶ ${gate.name} (pnpm ${gate.script})\n`);
    const { command, args } = pnpmInvocation(process.env.npm_execpath, ["-s", gate.script]);
    const started = performance.now();
    const run = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
    return { gate, ok: run.status === 0, seconds: (performance.now() - started) / 1000 };
  });
  const { text, ok } = summary(results);
  (ok ? process.stdout : process.stderr).write(`\n${text}\n`);
  if (!ok) process.exitCode = 1;
}

main();
