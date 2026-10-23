import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/shared/supabase/database.types";

export const SCREENSHOT_BUCKET = "verification-screenshots";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 5 * 1024 * 1024;

// compare.json comes from a run that executed the PR's code, so every name in it is checked before it becomes a path.
const steps = z.object({ steps: z.array(z.object({ screenshot: z.string().regex(/^step-\d{2,3}\.png$/).nullable() }).loose()) }).loose();
export const compareJsonSchema = z
  .object({ flows: z.array(z.object({ name: z.string().regex(/^[a-z][a-z0-9-]*\.[a-zA-Z][a-zA-Z0-9-]*$/), base: steps, pr: steps }).loose()).max(20) })
  .loose();

export type CompareJson = z.infer<typeof compareJsonSchema>;

export type Shot = { readonly file: string; readonly key: string };

function last(side: z.infer<typeof steps>): string | undefined {
  return [...side.steps].reverse().find((step) => step.screenshot !== null)?.screenshot ?? undefined;
}

function inside(dir: string, ...parts: string[]): string {
  const path = resolve(dir, ...parts);
  const rel = relative(resolve(dir), path);
  if (rel === "" || rel.startsWith("..") || rel.split(sep).includes("..")) throw new Error(`${parts.join("/")} escapes ${dir}`);
  return path;
}

// The final screenshot of each compared flow, before and after: what the Timeline shows.
export function finalShots(compare: unknown, runDir: string, prefix: string): { before: Shot[]; after: Shot[] } {
  const parsed = compareJsonSchema.safeParse(compare);
  if (!parsed.success) throw new Error(`compare.json isn't what verify:compare writes: ${z.prettifyError(parsed.error)}`);
  const before: Shot[] = [];
  const after: Shot[] = [];
  for (const flow of parsed.data.flows) {
    const base = last(flow.base);
    const pr = last(flow.pr);
    if (base !== undefined) before.push({ file: inside(runDir, "base", flow.name, base), key: `${prefix}/before/${flow.name}/${base}` });
    if (pr !== undefined) after.push({ file: inside(runDir, "pr", flow.name, pr), key: `${prefix}/after/${flow.name}/${pr}` });
  }
  return { before, after };
}

export function checkedPng(bytes: Buffer, name: string): Buffer {
  if (bytes.length > MAX_BYTES) throw new Error(`${name} is over 5 MB`);
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error(`${name} isn't a PNG`);
  return bytes;
}

export async function uploadShots(supabase: SupabaseClient<Database>, shots: readonly Shot[]): Promise<string[]> {
  const urls: string[] = [];
  for (const shot of shots) {
    const bucket = supabase.storage.from(SCREENSHOT_BUCKET);
    const uploaded = await bucket.upload(shot.key, checkedPng(readFileSync(shot.file), shot.key), { contentType: "image/png", upsert: true });
    if (uploaded.error) throw new Error(`uploading ${shot.key} failed: ${uploaded.error.message}`);
    urls.push(bucket.getPublicUrl(shot.key).data.publicUrl);
  }
  return urls;
}
