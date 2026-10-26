import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { IssueJson } from "./evolution/build";
import { gh, issueNumberArg } from "./evolution/github-issue";
import { finalVerdict, renderVerdictComment, VERDICT_MARKER, verdictSchema } from "./evolution/verdict";

// pnpm evolution:verdict <verdict.json> <issue.json> <pr number> <sha> turns the judge's JSON into the result of the
// evolution-verify check: it posts (or updates) one sticky PR comment and exits 1 unless every criterion passed.
const root = join(import.meta.dirname, "..");
const usage = "usage: pnpm evolution:verdict <verdict.json> <issue.json> <pr number> <head sha>";

function upsertComment(pr: number, body: string): void {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY isn't set");
  const comments = JSON.parse(gh(root, ["api", "--paginate", "--slurp", `repos/${repo}/issues/${String(pr)}/comments`])) as { id: number; body: string; user: { type: string } }[][];
  const existing = comments.flat().find((comment) => comment.user.type === "Bot" && comment.body.startsWith(VERDICT_MARKER));
  const file = join(root, "artifacts", "evolution", "verdict-comment.md");
  writeFileSync(file, body);
  if (existing) gh(root, ["api", "--method", "PATCH", `repos/${repo}/issues/comments/${String(existing.id)}`, "-F", `body=@${file}`]);
  else gh(root, ["api", "--method", "POST", `repos/${repo}/issues/${String(pr)}/comments`, "-F", `body=@${file}`]);
}

function main(): void {
  const [verdictFile, issueFile, prArg, sha] = process.argv.slice(2);
  if (verdictFile === undefined || issueFile === undefined || sha === undefined || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(usage);
  const pr = issueNumberArg(prArg, usage);
  const issue = JSON.parse(readFileSync(issueFile, "utf8")) as IssueJson;
  const parsed = verdictSchema.safeParse(JSON.parse(readFileSync(verdictFile, "utf8")));
  if (!parsed.success) throw new Error(`the verdict doesn't match the schema: ${z.prettifyError(parsed.error)}`);
  const result = finalVerdict(parsed.data, issue.acceptanceCriteria.length);
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? ""}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;
  const body = renderVerdictComment({
    verdict: parsed.data,
    criteria: issue.acceptanceCriteria.map((item) => item.criterion),
    passed: result.passed,
    reasons: result.reasons,
    runUrl,
    sha,
  });
  upsertComment(pr, body);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, body);
  process.stdout.write(`verdict: ${result.passed ? "pass" : `fail (${result.reasons.join("; ")})`}\n`);
  if (!result.passed) process.exitCode = 1;
}

main();
