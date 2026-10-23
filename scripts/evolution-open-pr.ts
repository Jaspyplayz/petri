import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { builderReportSchema, prTitle, renderPrBody, slugify, type BuiltIssue } from "./evolution/build";
import { finalShots, uploadShots, type CompareJson } from "./evolution/screenshots";
import { loopSupabase } from "./evolution/supabase";

// pnpm evolution:open-pr <branch> opens the evolution PR for an already pushed branch. It reads the issue, the
// builder's report and the newest verify:all and verify:compare runs, uploads the final before/after screenshots
// to Supabase Storage and fills the PR template. GH_TOKEN must be EVOLUTION_BOT_TOKEN so CI runs on the PR.
const root = join(import.meta.dirname, "..");
const evolutionDir = join(root, "artifacts", "evolution");
const verifyDir = join(root, "artifacts", "verify");

function newestRunWith(file: string): string {
  const runs = existsSync(verifyDir) ? readdirSync(verifyDir).filter((name) => existsSync(join(verifyDir, name, file))) : [];
  const newest = runs.sort().at(-1);
  if (newest === undefined) throw new Error(`no verify run in artifacts/verify has ${file}`);
  return join(verifyDir, newest);
}

function gh(args: readonly string[]): string {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`gh ${args[0] ?? ""} ${args[1] ?? ""} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const branch = process.argv[2];
  if (branch === undefined || !branch.startsWith("evo/")) throw new Error("usage: pnpm evolution:open-pr <evo/branch>");
  const issue = JSON.parse(readFileSync(join(evolutionDir, "issue.json"), "utf8")) as BuiltIssue;
  const parsed = builderReportSchema.safeParse(JSON.parse(readFileSync(join(evolutionDir, "build-report.json"), "utf8")));
  if (!parsed.success) throw new Error(`the builder's report doesn't match the schema: ${z.prettifyError(parsed.error)}`);

  const verifyRun = newestRunWith("summary.md");
  const compareRun = newestRunWith("compare.json");
  const compare = JSON.parse(readFileSync(join(compareRun, "compare.json"), "utf8")) as CompareJson;
  const shots = finalShots(compare, compareRun, `pr/${slugify(branch)}`);
  const supabase = loopSupabase();
  const before = await uploadShots(supabase, shots.before);
  const after = await uploadShots(supabase, shots.after);

  const body = renderPrBody({
    issue,
    report: parsed.data,
    verifySummary: readFileSync(join(verifyRun, "summary.md"), "utf8"),
    compareSummary: readFileSync(join(compareRun, "compare.md"), "utf8"),
    before,
    after,
  });
  const bodyFile = join(evolutionDir, "pr-body.md");
  writeFileSync(bodyFile, body);
  const url = gh([
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    branch,
    "--title",
    prTitle(issue),
    "--body-file",
    bodyFile,
    "--label",
    `evolution,risk:${issue.riskLevel}`,
  ]);
  process.stdout.write(`open-pr: ${url}\n`);
  const output = process.env.GITHUB_OUTPUT;
  if (output) writeFileSync(output, `url=${url}\n`, { flag: "a" });
}

await main();
