import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonRecord, requireInteger, requireRecord, requireString, requireStringArray } from "./json.ts";

export const GUARDRAILS_CONFIG_PATH = ".github/guardrails.json";

export type GuardrailsConfig = {
  readonly protectedPaths: readonly string[];
  readonly agentPullRequests: {
    readonly labels: readonly string[];
    readonly branchPrefixes: readonly string[];
    readonly authors: readonly string[];
  };
  readonly postmortem: {
    readonly addPaths: readonly string[];
    readonly modifyPaths: readonly string[];
  };
  readonly humanOnlyLabels: {
    readonly protectedPaths: string;
    readonly prSize: string;
  };
  readonly prSize: {
    readonly maxChangedLines: number;
    readonly ignoredPaths: readonly string[];
  };
  readonly migrations: {
    readonly paths: readonly string[];
    readonly allowedFromTrustLevel: number;
  };
  readonly trustConfigPath: string;
  readonly pauseFilePath: string;
};

export function parseGuardrailsConfig(json: string): GuardrailsConfig {
  const root = parseJsonRecord(json);
  if (!root) throw new Error(`${GUARDRAILS_CONFIG_PATH} must be a JSON object`);
  const where = GUARDRAILS_CONFIG_PATH;
  const agent = requireRecord(root, "agentPullRequests", where);
  const labels = requireRecord(root, "humanOnlyLabels", where);
  const prSize = requireRecord(root, "prSize", where);
  const migrations = requireRecord(root, "migrations", where);
  const postmortem = requireRecord(root, "postmortem", where);
  return {
    protectedPaths: requireStringArray(root, "protectedPaths", where),
    agentPullRequests: {
      labels: requireStringArray(agent, "labels", `${where}.agentPullRequests`),
      branchPrefixes: requireStringArray(agent, "branchPrefixes", `${where}.agentPullRequests`),
      authors: requireStringArray(agent, "authors", `${where}.agentPullRequests`),
    },
    postmortem: {
      addPaths: requireStringArray(postmortem, "addPaths", `${where}.postmortem`),
      modifyPaths: requireStringArray(postmortem, "modifyPaths", `${where}.postmortem`),
    },
    humanOnlyLabels: {
      protectedPaths: requireString(labels, "protectedPaths", `${where}.humanOnlyLabels`),
      prSize: requireString(labels, "prSize", `${where}.humanOnlyLabels`),
    },
    prSize: {
      maxChangedLines: requireInteger(prSize, "maxChangedLines", `${where}.prSize`),
      ignoredPaths: requireStringArray(prSize, "ignoredPaths", `${where}.prSize`),
    },
    migrations: {
      paths: requireStringArray(migrations, "paths", `${where}.migrations`),
      allowedFromTrustLevel: requireInteger(migrations, "allowedFromTrustLevel", `${where}.migrations`),
    },
    trustConfigPath: requireString(root, "trustConfigPath", where),
    pauseFilePath: requireString(root, "pauseFilePath", where),
  };
}

export function loadGuardrailsConfig(root: string): GuardrailsConfig {
  return parseGuardrailsConfig(readFileSync(join(root, GUARDRAILS_CONFIG_PATH), "utf8"));
}

export function guardrailsConfigAt(root: string, readCommitted: (path: string) => string | undefined): GuardrailsConfig {
  const committed = readCommitted(GUARDRAILS_CONFIG_PATH);
  return committed === undefined ? loadGuardrailsConfig(root) : parseGuardrailsConfig(committed);
}
