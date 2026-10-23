import { z } from "zod";

export const BLOB_STORAGE_KEY = "petri.blob.v1";
export const BLOB_NAME_MAX_LENGTH = 24;
export const BLOB_MIN_SIZE = 1;
export const BLOB_MAX_SIZE = 2;
export const BLOB_GROWTH_PER_FEED = 0.05;

export const BLOB_COLORS = [
  { id: "green", label: "Green", fill: "var(--color-culture)", stroke: "var(--color-culture-deep)" },
  { id: "pink", label: "Pink", fill: "#e86fa3", stroke: "#b34378" },
  { id: "blue", label: "Blue", fill: "#4a90d9", stroke: "#2d63a0" },
  { id: "orange", label: "Orange", fill: "#ef8a3c", stroke: "#b5601f" },
  { id: "purple", label: "Purple", fill: "#9b6fd6", stroke: "#6c46a3" },
] as const;

export type BlobColorId = (typeof BLOB_COLORS)[number]["id"];

export const DEFAULT_BLOB_COLOR: BlobColorId = "green";

export type BlobState = {
  readonly name: string;
  readonly size: number;
  readonly pokes: number;
  readonly feeds: number;
  readonly color: BlobColorId;
};

export const initialBlobState: BlobState = {
  name: "Blobby",
  size: BLOB_MIN_SIZE,
  pokes: 0,
  feeds: 0,
  color: DEFAULT_BLOB_COLOR,
};

const blobNameSchema = z
  .string()
  .trim()
  .min(1, "Give your blob a name.")
  .max(BLOB_NAME_MAX_LENGTH, `Names can be at most ${String(BLOB_NAME_MAX_LENGTH)} characters.`);

const storedBlobSchema = z.object({
  name: blobNameSchema,
  size: z.number().min(BLOB_MIN_SIZE).max(BLOB_MAX_SIZE),
  pokes: z.number().int().nonnegative(),
  feeds: z.number().int().nonnegative(),
  color: z.enum(["green", "pink", "blue", "orange", "purple"]).default(DEFAULT_BLOB_COLOR),
});

export function poke(state: BlobState): BlobState {
  return { ...state, pokes: state.pokes + 1 };
}

export function feed(state: BlobState): BlobState {
  const grown = Math.round((state.size + BLOB_GROWTH_PER_FEED) * 100) / 100;
  return { ...state, size: Math.min(BLOB_MAX_SIZE, grown), feeds: state.feeds + 1 };
}

export function recolor(state: BlobState, color: BlobColorId): BlobState {
  return { ...state, color };
}

export function blobColor(state: BlobState): (typeof BLOB_COLORS)[number] {
  return BLOB_COLORS.find((color) => color.id === state.color) ?? BLOB_COLORS[0];
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
  return `${String(Math.round(state.size * 100))}%`;
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
