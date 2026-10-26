import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readEvolutionConfig } from "./evolution/config";
import { loopSupabase } from "./evolution/supabase";
import { featureUsage, rankFeedback, renderTriageData, withBuiltSteps, type TriageInput } from "./evolution/triage-input";

// pnpm evolution:triage-input writes artifacts/evolution/triage-input.json (for create-issues to check ids against)
// and triage-data.md (the delimited block the triage agent reads). It only reads the database.
const root = join(import.meta.dirname, "..");
const outDir = join(root, "artifacts", "evolution");
const MAX_CANDIDATES = 20;
const USAGE_DAYS = 7;

async function main(): Promise<void> {
  const config = readEvolutionConfig(root);
  const supabase = loopSupabase();
  const now = new Date();
  const feedback = await supabase
    .from("feedback")
    .select("id, body, category, vote_count, created_at")
    .eq("status", "new")
    .eq("hidden", false)
    .gte("vote_count", config.minVotesToConsider)
    .order("vote_count", { ascending: false })
    .limit(200);
  if (feedback.error) throw new Error(`reading feedback failed: ${feedback.error.message}`);
  const since = new Date(now.getTime() - USAGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = await supabase.from("events").select("feature_id").gte("created_at", since).limit(50_000);
  if (events.error) throw new Error(`reading events failed: ${events.error.message}`);
  const ranked = rankFeedback(feedback.data, { now, minVotes: config.minVotesToConsider, limit: MAX_CANDIDATES });
  const changes = await supabase
    .from("changelog")
    .select("title, feedback_ids")
    .eq("kind", "change")
    .overlaps("feedback_ids", ranked.map((candidate) => candidate.id))
    .order("merged_at", { ascending: true });
  if (changes.error) throw new Error(`reading the changelog failed: ${changes.error.message}`);

  const input: TriageInput = {
    generatedAt: now.toISOString(),
    candidates: withBuiltSteps(ranked, changes.data),
    featureUsage: featureUsage(events.data),
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "triage-input.json"), `${JSON.stringify(input, null, 2)}\n`);
  writeFileSync(join(outDir, "triage-data.md"), renderTriageData(input));
  process.stdout.write(
    `triage-input: ${String(input.candidates.length)} candidate(s) with at least ${String(config.minVotesToConsider)} votes, ${String(input.candidates.filter((candidate) => candidate.builtSteps.length > 0).length)} with steps already built; events in the last ${String(USAGE_DAYS)} days: ${JSON.stringify(input.featureUsage)}\n`,
  );
}

await main();
