import { matchesAny } from "./glob.ts";

const GRAPH_SECTIONS = new Set(["importers", "packages", "snapshots"]);
const REGISTRY_RESOLUTION = /^\s+resolution: \{integrity: [\w+/=-]+\}$/;

function yamlDocuments(text: string): string[] {
  return text
    .replaceAll("\r\n", "\n")
    .split(/^---$/m)
    .filter((document) => document.trim() !== "");
}

function topLevelSections(document: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | undefined;
  for (const line of document.split("\n")) {
    const key = /^([^\s#][^:]*):/.exec(line)?.[1];
    if (key !== undefined) current = key;
    if (current !== undefined) sections.set(current, `${sections.get(current) ?? ""}${line}\n`);
  }
  return sections;
}

function importerEntries(importers: string): Map<string, { readonly name: string; readonly block: string }> {
  const entries = new Map<string, { name: string; block: string }>();
  let importer = "";
  let group = "";
  let key: string | undefined;
  for (const line of importers.split("\n")) {
    const indent = /^ */.exec(line)?.[0].length ?? 0;
    const name = line.trim().replace(/:$/, "").replace(/^'(.*)'$/, "$1");
    if (line.trim() === "") continue;
    if (indent === 2) importer = name;
    if (indent === 4) group = name;
    if (indent <= 4) key = undefined;
    if (indent === 6) {
      key = `${importer} ${group} ${name}`;
      entries.set(key, { name, block: "" });
    }
    const entry = key === undefined ? undefined : entries.get(key);
    if (entry && indent >= 8) entry.block += `${line.trim()}\n`;
  }
  return entries;
}

export function lockfileReason(
  base: string | undefined,
  head: string | undefined,
  guardrailPackages: readonly string[],
): string | undefined {
  if (base === undefined || head === undefined) return "pnpm-lock.yaml can't be added or removed by an agent";
  const before = yamlDocuments(base);
  const after = yamlDocuments(head);
  if (before.length !== after.length || before.slice(0, -1).join("---") !== after.slice(0, -1).join("---")) {
    return "the pnpm-lock.yaml document that pins pnpm itself may not change";
  }
  const beforeSections = topLevelSections(before.at(-1) ?? "");
  const afterSections = topLevelSections(after.at(-1) ?? "");
  for (const key of new Set([...beforeSections.keys(), ...afterSections.keys()])) {
    if (!GRAPH_SECTIONS.has(key) && beforeSections.get(key) !== afterSections.get(key)) {
      return `pnpm-lock.yaml "${key}" (settings, overrides, patches) may not change`;
    }
  }
  const badResolution = head
    .replaceAll("\r\n", "\n")
    .split("\n")
    .find((line) => /^\s+resolution:/.test(line) && !REGISTRY_RESOLUTION.test(line));
  if (badResolution !== undefined) {
    return `pnpm-lock.yaml may only resolve packages from the npm registry (found "${badResolution.trim()}")`;
  }
  const beforeEntries = importerEntries(beforeSections.get("importers") ?? "");
  const afterEntries = importerEntries(afterSections.get("importers") ?? "");
  for (const key of new Set([...beforeEntries.keys(), ...afterEntries.keys()])) {
    const name = (beforeEntries.get(key) ?? afterEntries.get(key))?.name ?? "";
    if (matchesAny(name, guardrailPackages) && beforeEntries.get(key)?.block !== afterEntries.get(key)?.block) {
      return `pnpm-lock.yaml changes the guardrail toolchain package ${name}`;
    }
  }
  return undefined;
}
