export type JsonRecord = Readonly<Record<string, unknown>>;

export function asRecord(value: unknown): JsonRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries: [string, unknown][] = Object.entries(value);
  return Object.fromEntries(entries);
}

export function parseJsonRecord(text: string | undefined): JsonRecord | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return `[${items.map(canonicalJson).join(",")}]`;
  }
  const record = asRecord(value);
  if (record) {
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function requireString(record: JsonRecord, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") throw new Error(`${where}.${key} must be a non-empty string`);
  return value;
}

export function requireStringArray(record: JsonRecord, key: string, where: string): string[] {
  const value = record[key];
  const items: unknown[] = Array.isArray(value) ? value : [];
  if (!Array.isArray(value) || items.some((item) => typeof item !== "string")) {
    throw new Error(`${where}.${key} must be an array of strings`);
  }
  return items.filter((item) => typeof item === "string");
}

export function requireInteger(record: JsonRecord, key: string, where: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${where}.${key} must be a non-negative integer`);
  }
  return value;
}

export function requireRecord(record: JsonRecord, key: string, where: string): JsonRecord {
  const value = asRecord(record[key]);
  if (!value) throw new Error(`${where}.${key} must be an object`);
  return value;
}
