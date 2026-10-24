import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonRecord, requireInteger } from "./check-pr/json";
import { levelStartedAt, renderReport, suggest, trustStats, type ConfigVersion, type MergedPullRequest } from "./trust-report/ladder";

// pnpm trust-report prints the report. With --issue it also opens an issue when it suggests a promotion
// (or comments on the open one). It never edits .evolution/config.json.
const root = join(import.meta.dirname, "..");
const CONFIG = ".evolution/config.json";
const ISSUE_LABEL = "evolution:trust-report";

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout;
}

function trustLevelIn(text: string | undefined): number | undefined {
  const record = parseJsonRecord(text);
  if (record === undefined) return undefined;
  try {
    return requireInteger(record, "trustLevel", CONFIG);
  } catch {
    return undefined;
  }
}

function configVersions(): ConfigVersion[] {
  return run("git", ["log", "--format=%H %cI", "--", CONFIG])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [sha = "", date = ""] = line.split(" ");
      const shown = spawnSync("git", ["show", `${sha}:${CONFIG}`], { cwd: root, encoding: "utf8", windowsHide: true });
      return { date, trustLevel: trustLevelIn(shown.status === 0 ? shown.stdout : undefined) };
    });
}

function mergedSince(since: string | undefined): MergedPullRequest[] {
  const search = since === undefined ? [] : ["--search", `merged:>=${since.slice(0, 10)}`];
  const raw = run("gh", ["pr", "list", "--state", "merged", "--base", "main", "--limit", "1000", ...search, "--json", "number,title,mergedAt,labels"]);
  const prs = JSON.parse(raw) as { number: number; title: string; mergedAt: string; labels: { name: string }[] }[];
  return prs.map((pr) => ({ number: pr.number, title: pr.title, mergedAt: pr.mergedAt, labels: pr.labels.map((label) => label.name) }));
}

function postIssue(level: number, report: string): string {
  run("gh", ["label", "create", ISSUE_LABEL, "--color", "0E8A16", "--description", "Suggested trust promotion (a human decides)", "--force"]);
  const open =JSON.parse(run("gh", ["issue", "list", "--state", "open", "--label", ISSUE_LABEL, "--json", "number"])) as { number: number }[];
  const existing = open[0];
  if (existing !== undefined) {
    run("gh", ["issue", "comment", String(existing.number), "--body", report]);
    return `commented on #${String(existing.number)}`;
  }
  return run("gh", ["issue", "create", "--title", `Trust: promote to level ${String(level)}?`, "--label", ISSUE_LABEL, "--body", report]).trim();
}

function main(): void {
  const level = trustLevelIn(readFileSync(join(root, CONFIG), "utf8"));
  if (level === undefined) throw new Error(`${CONFIG} needs a non-negative integer trustLevel`);
  const since = levelStartedAt(configVersions());
  const stats = trustStats(level, since, mergedSince(since));
  const suggestion = suggest(stats);
  const report = renderReport(stats, suggestion);
  process.stdout.write(report);
  if (process.argv.includes("--issue") && suggestion.promoteTo !== undefined) {
    process.stdout.write(`\ntrust-report: ${postIssue(suggestion.promoteTo, report)}\n`);
  }
}

main();
