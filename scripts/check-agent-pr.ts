// node scripts/check-agent-pr.ts: writes agent=true|false to $GITHUB_OUTPUT, with the same rules guardrails uses (label,
// author, branch prefix, bot commits). Jobs that hand PR code a secret run only when it says false.
import { appendFileSync } from "node:fs";
import { describeRange, loadCheckContext } from "./check-pr/context.ts";

const context = loadCheckContext(process.argv.slice(2), process.env);
const agent = context.agentReasons.length > 0;
process.stdout.write(`check-agent-pr: ${describeRange(context)} ${agent ? `is an agent PR (${context.agentReasons.join(", ")})` : "is not an agent PR"}.\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `agent=${String(agent)}\n`);
