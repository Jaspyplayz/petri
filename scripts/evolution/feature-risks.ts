import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RiskLevel } from "../../src/shared/lib/feature-manifest";
import { manifestIdsInSource } from "../check-features/manifests";
import { manifestPath, manifestRiskLevel } from "./automerge";

// Each feature's riskLevel in this checkout, read as text: the scripts that need it hold the bot token, and an agent PR
// can change a manifest. One that isn't a single defineFeature with the folder's id and a plain literal riskLevel
// throws, so the run stops instead of treating that feature as new or unrated.
export function featureRisks(root: string): Map<string, RiskLevel> {
  const risks = new Map<string, RiskLevel>();
  for (const entry of readdirSync(join(root, "src", "features"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = manifestPath(entry.name);
    const source = readFileSync(join(root, path), "utf8");
    const ids = manifestIdsInSource(source);
    const risk = manifestRiskLevel(source);
    if (ids.length !== 1 || ids[0] !== entry.name || risk === undefined) {
      throw new Error(`${path} can't be read as text: it needs one defineFeature with id "${entry.name}" and one plain literal riskLevel`);
    }
    risks.set(entry.name, risk);
  }
  return risks;
}
