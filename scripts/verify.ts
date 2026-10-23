import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser } from "@playwright/test";
import { featureManifests } from "../src/features/registry";
import { pairSteps, renderCompare, writeSideBySide, type ComparedFlow } from "./verify/compare";
import { renderSummary, runFolderName, type VerifyReport } from "./verify/report";
import { runVerification } from "./verify/runner";
import { ensureServer, stopServer, verifyDirectory, verifyPort } from "./verify/server";
import { flowNames, parseScript, resolveFlow, type VerifyRun } from "./verify/steps";
import { VerifyError } from "./verify/verify-error";
import { installBaseDependencies, prepareBaseWorktree, resolveCommit, shareEnvLocal } from "./verify/worktree";

const root = join(import.meta.dirname, "..");
const usage = [
  "usage:",
  "  pnpm verify:up                       build and start the app plus local Supabase, then print its URL",
  "  pnpm verify:down                     stop the app that verify:up started",
  "  pnpm verify:flow <feature>.<flow>    run one flow from a feature manifest",
  "  pnpm verify:script <file.json>       run ad-hoc steps (targets are data-testids)",
  "  pnpm verify:all                      run every flow in every manifest",
  "  pnpm verify:compare <baseRef> [flow ...]",
  "                                       run the flows (default: all) on baseRef's build and on this",
  "                                       working tree, with side-by-side screenshots",
  "",
  "  --base-url <url>   verify a running app (for example a preview) instead of starting one; not for compare",
  "  --read-only        with all: skip flows marked writes: true (for production, where they'd leave real rows)",
  "",
].join("\n");

function commandLine(args: readonly string[]): { positionals: string[]; baseUrl: string | undefined; readOnly: boolean } {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: { "base-url": { type: "string" }, "read-only": { type: "boolean" } },
      allowPositionals: true,
      strict: true,
    });
    return { positionals, baseUrl: values["base-url"], readOnly: values["read-only"] === true };
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

async function startBase(sha: string, label: string, port: number, runDir: string): Promise<{ dir: string; url: string }> {
  const base = prepareBaseWorktree(root, sha, join(tmpdir(), `${basename(root)}-verify-base`));
  if (base.created || !existsSync(join(base.dir, "node_modules"))) {
    process.stdout.write(`verify: installing ${label}'s dependencies in ${base.dir}\n`);
    installBaseDependencies(base.dir, join(runDir, "base-install.log"));
  }
  shareEnvLocal(root, base.dir);
  process.stdout.write(`verify: before is ${label}, built in ${base.dir}\n`);
  return { dir: base.dir, url: await ensureServer(base.dir, port) };
}

async function compareRuns(baseRef: string, runs: readonly VerifyRun[]): Promise<number> {
  const sha = resolveCommit(root, baseRef);
  const label = `${baseRef} (${sha.slice(0, 7)})`;
  const port = verifyPort();
  if (port === 65_535) throw new VerifyError("VERIFY_PORT must leave the next port free for the base build");
  const runDir = join(verifyDirectory(root), runFolderName(new Date()));
  mkdirSync(runDir, { recursive: true });
  const base = await startBase(sha, label, port + 1, runDir);
  const flows: ComparedFlow[] = [];
  try {
    process.stdout.write("verify: after is this working tree\n");
    const prUrl = await ensureServer(root, port);
    const browser = await launchBrowser();
    try {
      for (const run of runs) {
        const before = join(runDir, "base", run.name);
        const after = join(runDir, "pr", run.name);
        const baseReport = await runVerification(browser, run, { baseUrl: base.url, outDir: before });
        const prReport = await runVerification(browser, run, { baseUrl: prUrl, outDir: after });
        const outDir = join(runDir, "compare", run.name);
        mkdirSync(outDir, { recursive: true });
        const sides = { before: { title: `Before: ${label}`, dir: before }, after: { title: "After: this working tree", dir: after } };
        const written = await writeSideBySide(browser, run.name, pairSteps(baseReport, prReport), sides, outDir);
        const images = written.map(({ number, path }) => ({ number, file: relative(runDir, path).replaceAll("\\", "/") }));
        flows.push({ name: run.name, base: baseReport, pr: prReport, images });
        const verdict = `${prReport.passed ? "PASS" : "FAIL"} ${run.name} (before: ${baseReport.passed ? "pass" : "fail"})`;
        process.stdout.write(`${verdict} ${relative(root, outDir)}\n`);
        for (const failure of prReport.failures) process.stdout.write(`  ✖ ${failure}\n`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(base.dir);
  }
  writeFileSync(join(runDir, "compare.md"), renderCompare(baseRef, sha, flows));
  writeFileSync(join(runDir, "compare.json"), `${JSON.stringify({ baseRef, sha, flows }, null, 2)}\n`);
  process.stdout.write(`compare: ${relative(root, join(runDir, "compare.md"))}\n`);
  return flows.every((flow) => flow.pr.passed) ? 0 : 1;
}

function single(positionals: readonly string[], what: string): string {
  const [value, ...extra] = positionals;
  if (value === undefined || extra.length > 0) throw new VerifyError(`expected exactly one ${what}\n\n${usage}`);
  return value;
}

async function main(command: string | undefined, args: readonly string[]): Promise<number> {
  const { positionals, baseUrl, readOnly } = commandLine(args);
  if (readOnly && command !== "all") throw new VerifyError("--read-only only applies to verify:all");
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
      const runs = flowNames(featureManifests, { readOnly }).map((name) => resolveFlow(featureManifests, name));
      if (runs.length === 0) throw new VerifyError(readOnly ? "no feature manifest defines a flow that doesn't write" : "no feature manifest defines a flow");
      return verifyRuns(runs, await baseUrlFor(baseUrl), true);
    }
    case "compare": {
      const [baseRef, ...names] = positionals;
      if (baseRef === undefined) throw new VerifyError(`expected a base ref, such as origin/main\n\n${usage}`);
      if (baseUrl !== undefined) throw new VerifyError("compare builds both sides itself, so it doesn't take --base-url");
      const runs = (names.length > 0 ? names : flowNames(featureManifests)).map((name) => resolveFlow(featureManifests, name));
      if (runs.length === 0) throw new VerifyError("no feature manifest defines a flow");
      return compareRuns(baseRef, runs);
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
