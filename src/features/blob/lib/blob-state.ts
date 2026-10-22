import { z } from "zod";

export const BLOB_STORAGE_KEY = "petri.blob.v1";
export const BLOB_NAME_MAX_LENGTH = 24;
export const BLOB_MIN_SIZE = 1;
export const BLOB_MAX_SIZE = 2;
export const BLOB_GROWTH_PER_FEED = 0.05;

export type BlobState = {
  readonly name: string;
  readonly size: number;
  readonly pokes: number;
  readonly feeds: number;
};

export const initialBlobState: BlobState = { name: "Blobby", size: BLOB_MIN_SIZE, pokes: 0, feeds: 0 };

const blobNameSchema = z
  .string()
  .trim()
  .min(1, "Give your blob a name.")
  .max(BLOB_NAME_MAX_LENGTH, `Names can be at most ${BLOB_NAME_MAX_LENGTH} characters.`);

const storedBlobSchema = z.object({
  name: blobNameSchema,
  size: z.number().min(BLOB_MIN_SIZE).max(BLOB_MAX_SIZE),
  pokes: z.number().int().nonnegative(),
  feeds: z.number().int().nonnegative(),
});

export function poke(state: BlobState): BlobState {
  return { ...state, pokes: state.pokes + 1 };
}

export function feed(state: BlobState): BlobState {
  const grown = Math.round((state.size + BLOB_GROWTH_PER_FEED) * 100) / 100;
  return { ...state, size: Math.min(BLOB_MAX_SIZE, grown), feeds: state.feeds + 1 };
}

export function isFullyGrown(state: BlobState): boolean {
  return state.size >= BLOB_MAX_SIZE;
}

export type RenameResult =
  | { readonly ok: true; readonly state: BlobState }
  | { readonly ok: false; readonly error: string };

export function rename(state: BlobState, rawName: string): RenameResult {
  const parsed = blobNameSchema.safeParse(rawName);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }
  return { ok: true, state: { ...state, name: parsed.data } };
}

export function formatSize(state: BlobState): string {
  return `${Math.round(state.size * 100)}%`;
}

export function parseBlobState(raw: string | null): BlobState {
  if (raw === null) return initialBlobState;
  try {
    const parsed = storedBlobSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : initialBlobState;
  } catch {
    return initialBlobState;
  }
}

export function serializeBlobState(state: BlobState): string {
  return JSON.stringify(state);
}
