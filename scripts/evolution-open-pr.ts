import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import { builderReportSchema, prTitle, renderPrBody, slugify } from "./evolution/build";
import { fetchIssue, gh, issueNumberArg } from "./evolution/github-issue";
import { finalShots, uploadShots } from "./evolution/screenshots";
import { loopSupabase } from "./evolution/supabase";

// pnpm evolution:open-pr <evo/branch> <issue> <report.json> <verify run dir> <compare run dir> opens the evolution PR
// for a branch that is already pushed. The build workflow runs it in a job that never executes the PR's code: the
// issue comes from GitHub, and the report, summaries and screenshots are checked before they're used.
// GH_TOKEN must be the evolution app's token so CI runs on the PR.
const root = join(import.meta.dirname, "..");
const usage = "usage: pnpm evolution:open-pr <evo/branch> <issue number> <report.json> <verify run dir> <compare run dir>";
const MAX_SUMMARY = 20_000;

function underArtifacts(path: string | undefined): string {
  if (path === undefined) throw new Error(usage);
  const full = resolve(root, path);
  const rel = relative(join(root, "artifacts"), full);
  if (rel.startsWith("..") || resolve(join(root, "artifacts"), rel) !== full) throw new Error(`${path} must be inside artifacts/`);
  return full;
}

// Verify's markdown is shown in a details block. It can't close the data comment or mention anyone.
function summary(file: string): string {
  const text = readFileSync(file, "utf8").replace(/@(?=[A-Za-z0-9-])/g, "@​").replaceAll("-->", "--​>");
  return text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY)}\n\n… (cut; the full report is in the run's artifacts)` : text;
}

async function main(): Promise<void> {
  const [branch, issueArg, reportArg, verifyArg, compareArg] = process.argv.slice(2);
  if (branch === undefined || !/^evo\/\d+-[a-z0-9-]+$/.test(branch)) throw new Error(usage);
  const issue = fetchIssue(root, issueNumberArg(issueArg, usage), { requireReady: true });
  const parsed = builderReportSchema.safeParse(JSON.parse(readFileSync(underArtifacts(reportArg), "utf8")));
  if (!parsed.success) throw new Error(`the builder's report doesn't match the schema: ${z.prettifyError(parsed.error)}`);
  const verifyRun = underArtifacts(verifyArg);
  const compareRun = underArtifacts(compareArg);

  const shots = finalShots(JSON.parse(readFileSync(join(compareRun, "compare.json"), "utf8")), compareRun, `pr/${slugify(branch)}`);
  const supabase = loopSupabase();
  const before = await uploadShots(supabase, shots.before);
  const after = await uploadShots(supabase, shots.after);

  const body = renderPrBody({
    issue,
    report: parsed.data,
    verifySummary: summary(join(verifyRun, "summary.md")),
    compareSummary: summary(join(compareRun, "compare.md")),
    before,
    after,
  });
  const bodyFile = join(root, "artifacts", "evolution", "pr-body.md");
  writeFileSync(bodyFile, body);
  const url = gh(root, ["pr", "create", "--base", "main", "--head", branch, "--title", prTitle(issue), "--body-file", bodyFile, "--label", `evolution,risk:${issue.riskLevel}`]);
  process.stdout.write(`open-pr: ${url}\n`);
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `url=${url}\n`);
}

await main();
