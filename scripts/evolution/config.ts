import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const CONFIG_PATH = ".evolution/config.json";
export const PAUSED_PATH = ".evolution/PAUSED";

const count = z.number().int().min(0);
const perAgent = <T extends z.ZodType>(value: T) => z.object({ triage: value, build: value, verify: value }).strict();

export const evolutionConfigSchema = z
  .object({
    trustLevel: z.number().int().min(0).max(4),
    maxIssuesPerTriage: count,
    maxOpenEvolutionPRs: count,
    maxMergesPerDay: count,
    maxAgentTurns: perAgent(z.number().int().min(1)),
    minVotesToConsider: count,
    models: perAgent(z.string().regex(/^claude-[a-z0-9-]+$/)),
    sentry: z
      .object({ windowMinutes: z.number().int().min(1), spikeMultiplier: z.number().min(1), minEvents: z.number().int().min(1) })
      .strict(),
  })
  .strict();

export type EvolutionConfig = z.infer<typeof evolutionConfigSchema>;

export function parseEvolutionConfig(text: string): EvolutionConfig {
  const result = evolutionConfigSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error(`${CONFIG_PATH} is invalid: ${z.prettifyError(result.error)}`);
  return result.data;
}

export function readEvolutionConfig(root: string): EvolutionConfig {
  return parseEvolutionConfig(readFileSync(join(root, CONFIG_PATH), "utf8"));
}
