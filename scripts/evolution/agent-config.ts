import { randomUUID } from "node:crypto";
import type { EvolutionConfig } from "./config";

// Each agent has its own prompt (.evolution/prompts/<agent>.md). The verifier is two runs, one that plans and one
// that judges, sharing the verify model and turn limit.
export const agents = ["triage", "build", "verify-plan", "verify-judge"] as const;

export type Agent = (typeof agents)[number];

const configKey: Record<Agent, keyof EvolutionConfig["models"]> = { triage: "triage", build: "build", "verify-plan": "verify", "verify-judge": "verify" };

export type AgentConfig = { readonly model: string; readonly maxTurns: number; readonly prompt: string; readonly jsonSchema: string | undefined };

export function agentConfig(agent: Agent, config: EvolutionConfig, prompt: string, jsonSchema: string | undefined): AgentConfig {
  return { model: config.models[configKey[agent]], maxTurns: config.maxAgentTurns[configKey[agent]], prompt, jsonSchema };
}

// $GITHUB_OUTPUT's multiline syntax: name<<DELIMITER, the value, DELIMITER. A random delimiter can't appear in the value.
export function githubOutputs(values: Readonly<Record<string, string>>, delimiter: () => string = () => `EOF_${randomUUID()}`): string {
  return Object.entries(values)
    .map(([name, value]) => {
      const end = delimiter();
      if (value.includes(end)) throw new Error(`the value of ${name} contains its delimiter`);
      return `${name}<<${end}\n${value}\n${end}\n`;
    })
    .join("");
}
