import { describeRange, loadCheckContext } from "./check-pr/context.ts";
import { numstat } from "./check-pr/git.ts";
import { measurePullRequest } from "./check-pr/pr-size.ts";

const context = loadCheckContext(process.argv.slice(2), process.env);
const { maxChangedLines, ignoredPaths } = context.config.prSize;
const size = measurePullRequest(numstat(context.root, context.base, context.head), ignoredPaths);
const range = describeRange(context);
const measured = `${String(size.total)} changed lines (limit ${String(maxChangedLines)}; ${String(size.ignored.length)} generated file(s) not counted)`;

function done(lines: readonly string[], ok: boolean): never {
  const text = lines.join("\n");
  (ok ? process.stdout : process.stderr).write(`${text}\n`);
  context.summary(`### pr-size ${ok ? "✅" : "❌"}\n\n${text}\n`);
  process.exit(ok ? 0 : 1);
}

if (context.agentReasons.length === 0) {
  done([`pr-size: ${range} is not an agent PR; ${measured}.`], true);
}
if (size.total <= maxChangedLines) {
  done([`pr-size: ${range} has ${measured}.`], true);
}

const label = context.config.humanOnlyLabels.prSize;
const biggest = size.counted.slice(0, 10).map((file) => `- ${file.path}: ${String(file.lines)}`);
if (await context.humanLabel(label)) {
  done([`pr-size: ${range} has ${measured}, approved by a maintainer with "${label}".`, ...biggest], true);
}

done(
  [
    `pr-size: ${range} is an agent PR (${context.agentReasons.join(", ")}) with ${measured}.`,
    ...biggest,
    "",
    `Split it into smaller PRs (one issue, one concern each), or a maintainer can add the label "${label}" after the latest push (new commits or a base-branch change void it).`,
  ],
  false,
);
