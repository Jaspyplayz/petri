import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/shared/supabase/database.types";

export const SCREENSHOT_BUCKET = "verification-screenshots";

type ComparedSteps = { readonly steps: readonly { readonly screenshot: string | null }[] };
export type CompareJson = { readonly flows: readonly { readonly name: string; readonly base: ComparedSteps; readonly pr: ComparedSteps }[] };

export type Shot = { readonly file: string; readonly key: string };

function last(steps: ComparedSteps): string | undefined {
  return [...steps.steps].reverse().find((step) => step.screenshot !== null)?.screenshot ?? undefined;
}

// The final screenshot of each compared flow, before and after: what the Timeline shows.
export function finalShots(compare: CompareJson, runDir: string, prefix: string): { before: Shot[]; after: Shot[] } {
  const before: Shot[] = [];
  const after: Shot[] = [];
  for (const flow of compare.flows) {
    const base = last(flow.base);
    const pr = last(flow.pr);
    if (base !== undefined) before.push({ file: join(runDir, "base", flow.name, base), key: `${prefix}/before/${flow.name}/${base}` });
    if (pr !== undefined) after.push({ file: join(runDir, "pr", flow.name, pr), key: `${prefix}/after/${flow.name}/${pr}` });
  }
  return { before, after };
}

export async function uploadShots(supabase: SupabaseClient<Database>, shots: readonly Shot[]): Promise<string[]> {
  const urls: string[] = [];
  for (const shot of shots) {
    const bucket = supabase.storage.from(SCREENSHOT_BUCKET);
    const uploaded = await bucket.upload(shot.key, readFileSync(shot.file), { contentType: "image/png", upsert: true });
    if (uploaded.error) throw new Error(`uploading ${shot.key} failed: ${uploaded.error.message}`);
    urls.push(bucket.getPublicUrl(shot.key).data.publicUrl);
  }
  return urls;
}
