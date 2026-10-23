import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentConfig, agents, githubOutputs, type Agent } from "./evolution/agent-config";
import { builderJsonSchema } from "./evolution/build";
import { readEvolutionConfig } from "./evolution/config";
import { triageJsonSchema } from "./evolution/triage-output";

// pnpm evolution:agent-config <triage|build|verify> writes model, max_turns, prompt (from .evolution/prompts/<agent>.md)
// and json_schema to $GITHUB_OUTPUT, so a workflow never hard-codes what lives in .evolution/.
const root = join(import.meta.dirname, "..");

function main(): void {
  const name = process.argv[2];
  if (!agents.some((agent) => agent === name)) throw new Error(`usage: pnpm evolution:agent-config <${agents.join("|")}>`);
  const agent = name as Agent;
  const prompt = readFileSync(join(root, ".evolution", "prompts", `${agent}.md`), "utf8");
  const schemas: Record<Agent, string | undefined> = { triage: triageJsonSchema(), build: builderJsonSchema(), verify: undefined };
  const config = agentConfig(agent, readEvolutionConfig(root), prompt, schemas[agent]);
  const output = process.env.GITHUB_OUTPUT;
  const values = { model: config.model, max_turns: String(config.maxTurns), prompt: config.prompt, json_schema: config.jsonSchema ?? "" };
  if (output) appendFileSync(output, githubOutputs(values));
  process.stdout.write(`agent-config (${agent}): ${config.model}, at most ${String(config.maxTurns)} turns, prompt ${String(prompt.length)} chars\n`);
}

main();
