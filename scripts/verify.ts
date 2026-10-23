import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser } from "@playwright/test";
import { featureManifests } from "../src/features/registry";
import { renderSummary, runFolderName, type VerifyReport } from "./verify/report";
import { runVerification } from "./verify/runner";
import { ensureServer, stopServer, verifyDirectory, verifyPort } from "./verify/server";
import { flowNames, parseScript, resolveFlow, type VerifyRun } from "./verify/steps";
import { VerifyError } from "./verify/verify-error";

const root = join(import.meta.dirname, "..");
const usage = [
  "usage:",
  "  pnpm verify:up                       build and start the app plus local Supabase, then print its URL",
  "  pnpm verify:down                     stop the app that verify:up started",
  "  pnpm verify:flow <feature>.<flow>    run one flow from a feature manifest",
  "  pnpm verify:script <file.json>       run ad-hoc steps (targets are data-testids)",
  "  pnpm verify:all                      run every flow in every manifest",
  "",
  "  --base-url <url>   verify a running app (for example a preview) instead of starting one",
  "",
].join("\n");

function commandLine(args: readonly string[]): { positionals: string[]; baseUrl: string | undefined } {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: { "base-url": { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    return { positionals, baseUrl: values["base-url"] };
  } catch (error) {
    throw new VerifyError(error instanceof Error ? error.message : String(error));
  }
}

async function baseUrlFor(given: string | undefined): Promise<string> {
  if (given === undefined) return ensureServer(root, verifyPort());
  if (!URL.canParse(given) || !/^https?:$/.test(new URL(given).protocol)) throw new VerifyError(`--base-url isn't an http(s) URL: ${given}`);
  return given;
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
    throw new VerifyError(`can't launch Chromium (run \`pnpm exec playwright install chromium\`): ${reason}`);
  }
}

function scriptRun(file: string): VerifyRun {
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new VerifyError(`can't read ${file} as JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseScript(`script.${basename(file, extname(file)).replace(/[^A-Za-z0-9_-]/g, "-")}`, json);
}

async function verifyRuns(runs: readonly VerifyRun[], baseUrl: string, withSummary: boolean): Promise<number> {
  const runDir = join(verifyDirectory(root), runFolderName(new Date()));
  const results: { folder: string; report: VerifyReport }[] = [];
  const browser = await launchBrowser();
  try {
    for (const run of runs) {
      const report = await runVerification(browser, run, { baseUrl, outDir: join(runDir, run.name) });
      results.push({ folder: run.name, report });
      const where = relative(root, join(runDir, run.name, "report.md"));
      const took = `${String(report.steps.length)} steps, ${(report.durationMs / 1000).toFixed(1)} s`;
      process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${report.name} (${took}) ${where}\n`);
      for (const failure of report.failures) process.stdout.write(`  ✖ ${failure}\n`);
    }
  } finally {
    await browser.close();
  }
  if (withSummary) {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "summary.md"), renderSummary(results));
    writeFileSync(join(runDir, "summary.json"), `${JSON.stringify(results.map(({ report }) => report), null, 2)}\n`);
    process.stdout.write(`summary: ${relative(root, join(runDir, "summary.md"))}\n`);
  }
  return results.every(({ report }) => report.passed) ? 0 : 1;
}

function single(positionals: readonly string[], what: string): string {
  const [value, ...extra] = positionals;
  if (value === undefined || extra.length > 0) throw new VerifyError(`expected exactly one ${what}\n\n${usage}`);
  return value;
}

async function main(command: string | undefined, args: readonly string[]): Promise<number> {
  const { positionals, baseUrl } = commandLine(args);
  switch (command ?? "") {
    case "up":
      process.stdout.write(`${await ensureServer(root, verifyPort())}\n`);
      return 0;
    case "down":
      process.stdout.write((await stopServer(root)) ? "verify: stopped the app\n" : "verify: no app was running\n");
      return 0;
    case "flow": {
      const run = resolveFlow(featureManifests, single(positionals, "<feature>.<flow>"));
      return verifyRuns([run], await baseUrlFor(baseUrl), false);
    }
    case "script": {
      const run = scriptRun(single(positionals, "<file.json>"));
      return verifyRuns([run], await baseUrlFor(baseUrl), false);
    }
    case "all": {
      const runs = flowNames(featureManifests).map((name) => resolveFlow(featureManifests, name));
      if (runs.length === 0) throw new VerifyError("no feature manifest defines a flow");
      return verifyRuns(runs, await baseUrlFor(baseUrl), true);
    }
    default:
      process.stderr.write(usage);
      return 2;
  }
}

try {
  process.exitCode = await main(process.argv[2], process.argv.slice(3));
} catch (error) {
  if (!(error instanceof VerifyError)) throw error;
  process.stderr.write(`verify: ${error.message}\n`);
  process.exitCode = 2;
}
