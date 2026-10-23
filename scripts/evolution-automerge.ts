import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadGuardrailsConfig } from "./check-pr/config";
import { prDataFromBody } from "./evolution/build";
import { readEvolutionConfig } from "./evolution/config";
import { decide, footprint, manifestPath, manifestRiskLevel, type ChangedFile, type Footprint, type ManifestRisk } from "./evolution/automerge";
import { mergedTodayArgs } from "./evolution/gate";
import { gh } from "./evolution/github-issue";
import { isEvolutionPr, linkedIssue, PR_FIELDS, type GhPr } from "./evolution/github-pr";
import { RISK_ORDER } from "./evolution/triage-output";
import { featureManifests } from "../src/features/registry";
import type { RiskLevel } from "../src/shared/lib/feature-manifest";

// pnpm evolution:automerge runs from a checkout of main (trusted code) after the gate. For each open evolution PR whose
// head passed evolution-verify, it compares the PR's footprint with the trust level. It writes the PRs that may merge
// to $GITHUB_OUTPUT as "merge=<number>:<head sha> ..." (the workflow merges them with the bot token), and labels the
// others needs-human with a comment saying why. A PR that already has needs-human is left alone. PRs already queued
// for auto-merge are judged again on every run and count against maxMergesPerDay. A PR over the cap waits for a run
// on a later day (the hourly schedule).
const root = join(import.meta.dirname, "..");
const MARKER = "<!-- evolution-automerge -->";
// GitHub's list-files API stops at 3000 files; a PR that big is a human's anyway.
const MAX_FILES = 3000;

type GhStatus = { context: string; state: string; description: string | null; creator: { login: string } | null };
type QueuedPr = GhPr & { readonly autoMergeRequest: unknown };

// The description evolution-verify.yml sets when the judge passed the PR. A "Not an evolution PR" success doesn't count.
const JUDGED_PASS = "Every acceptance criterion passed";

function repo(): string {
  const value = process.env.GITHUB_REPOSITORY;
  if (!value) throw new Error("GITHUB_REPOSITORY isn't set");
  return value;
}

// Statuses come newest first. Only the verify workflow's own token sets this one, and only a judged pass counts.
function verified(sha: string): boolean {
  const statuses = (JSON.parse(gh(root, ["api", "--paginate", "--slurp", `repos/${repo()}/commits/${sha}/statuses`])) as GhStatus[][]).flat();
  const latest = statuses.find((status) => status.context === "evolution-verify");
  return latest?.state === "success" && latest.description === JUDGED_PASS && latest.creator?.login === "github-actions[bot]";
}

// Each touched feature's riskLevel on main and at the PR's head. An unchanged manifest keeps main's value.
function manifestRisks(fp: Footprint, files: readonly ChangedFile[], sha: string, onMain: ReadonlyMap<string, RiskLevel>): ManifestRisk[] {
  return fp.features.map((feature) => {
    const path = manifestPath(feature);
    const before = onMain.get(feature);
    const changes = files.filter((file) => file.filename === path || file.previous_filename === path);
    if (changes.length === 0) return { feature, before, after: before };
    const kept = changes.some((file) => file.filename === path && file.status !== "removed");
    const source = kept ? gh(root, ["api", "-H", "Accept: application/vnd.github.raw", `repos/${repo()}/contents/${path}?ref=${sha}`]) : "";
    return { feature, before, after: kept ? manifestRiskLevel(source) : undefined };
  });
}

function prRisks(pr: GhPr): RiskLevel[] {
  const fromLabels = pr.labels.map((label) => /^risk:(.+)$/.exec(label.name)?.[1]).filter((risk): risk is RiskLevel => RISK_ORDER.includes(risk as RiskLevel));
  const fromData = prDataFromBody(pr.body)?.riskLevel;
  return [...fromLabels, ...(fromData === undefined ? [] : [fromData])];
}

// A push to a queued PR doesn't turn auto-merge off, so a PR that no longer qualifies loses it here.
function needsHuman(pr: QueuedPr, reason: string): void {
  if (pr.autoMergeRequest !== null) gh(root, ["pr", "merge", String(pr.number), "--disable-auto"]);
  const file = join(root, "artifacts", "evolution", `automerge-${String(pr.number)}.md`);
  writeFileSync(file, `${MARKER}\nNot auto-merged: ${reason}.\n\nA human can merge this PR after checking it. The \`evolution-verify\` comment has the evidence.\n`);
  gh(root, ["pr", "edit", String(pr.number), "--add-label", "needs-human"]);
  gh(root, ["pr", "comment", String(pr.number), "--body-file", file]);
}

function main(): void {
  const guardrails = loadGuardrailsConfig(root);
  const { trustLevel, maxMergesPerDay } = readEvolutionConfig(root);
  const onMain = new Map(featureManifests.map((manifest) => [manifest.id, manifest.riskLevel]));
  const features = new Set(onMain.keys());
  mkdirSync(join(root, "artifacts", "evolution"), { recursive: true });
  const fields = `${PR_FIELDS},autoMergeRequest`;
  const open = (JSON.parse(gh(root, ["pr", "list", "--state", "open", "--base", "main", "--limit", "100", "--json", fields])) as QueuedPr[]).filter((pr) => isEvolutionPr(pr, guardrails));
  const mergedToday = (JSON.parse(gh(root, mergedTodayArgs(new Date()))) as unknown[]).length;
  let budget = maxMergesPerDay - mergedToday - open.filter((pr) => pr.autoMergeRequest !== null).length;
  const merge: string[] = [];
  for (const pr of open) {
    const say = (message: string): void => void process.stdout.write(`#${String(pr.number)}: ${message}\n`);
    if (pr.isDraft || pr.labels.some((label) => label.name === "needs-human")) {
      say("skipped (draft or needs-human)");
      continue;
    }
    if (!verified(pr.headRefOid)) {
      say(`waiting: evolution-verify hasn't passed on ${pr.headRefOid}`);
      continue;
    }
    const issue = linkedIssue(root, pr);
    if (typeof issue === "string") {
      needsHuman(pr, issue);
      say(`needs-human: ${issue}`);
      continue;
    }
    const files = (JSON.parse(gh(root, ["api", "--paginate", "--slurp", `repos/${repo()}/pulls/${String(pr.number)}/files`])) as ChangedFile[][]).flat();
    const fp = footprint(files, features);
    const decision =
      files.length >= MAX_FILES
        ? { merge: false, reason: `it changes ${String(files.length)} or more files` }
        : decide({ trustLevel, issueRisk: issue.riskLevel, prRisks: prRisks(pr), manifests: manifestRisks(fp, files, pr.headRefOid, onMain), footprint: fp });
    if (decision.merge && pr.autoMergeRequest !== null) {
      say(`still allowed, auto-merge is already on: ${decision.reason}`);
    } else if (decision.merge && budget <= 0) {
      say(`waiting: maxMergesPerDay (${String(maxMergesPerDay)}) is used up today, counting PRs already queued`);
    } else if (decision.merge) {
      budget -= 1;
      merge.push(`${String(pr.number)}:${pr.headRefOid}`);
      say(`merge: ${decision.reason}`);
    } else {
      needsHuman(pr, decision.reason);
      say(`needs-human: ${decision.reason}`);
    }
  }
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `merge=${merge.join(" ")}\n`);
  if (open.length === 0) process.stdout.write("automerge: no open evolution PRs\n");
}

main();
