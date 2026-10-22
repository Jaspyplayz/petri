import { describeRange, loadCheckContext } from "./check-pr/context.ts";
import { changedFiles } from "./check-pr/git.ts";
import { matchesAny } from "./check-pr/glob.ts";
import { protectedPathViolations } from "./check-pr/protected-paths.ts";

const context = loadCheckContext(process.argv.slice(2), process.env);
const changes = changedFiles(context.root, context.base, context.head);
const touched = changes.filter((change) => matchesAny(change.path, context.config.protectedPaths));
const range = describeRange(context);

function done(lines: readonly string[], ok: boolean): never {
  const text = lines.join("\n");
  (ok ? process.stdout : process.stderr).write(`${text}\n`);
  context.summary(`### protected-paths ${ok ? "✅" : "❌"}\n\n${text}\n`);
  process.exit(ok ? 0 : 1);
}

if (context.agentReasons.length === 0) {
  done(
    [
      `protected-paths: ${range} is not an agent PR, so guardrail files may change here.`,
      ...touched.map((change) => `- ${change.path} (${change.status})`),
    ],
    true,
  );
}

const violations = protectedPathViolations(changes, context.config, context.read);
const agent = `agent PR (${context.agentReasons.join(", ")})`;
if (violations.length === 0) {
  done([`protected-paths: ${range} is an ${agent} and touches no protected path it may not change.`], true);
}

const label = context.config.humanOnlyLabels.protectedPaths;
const listing = violations.map((violation) => `- ✖ ${violation.path}: ${violation.reason}`);
if (await context.humanLabel(label)) {
  done(
    [`protected-paths: ${range} is an ${agent} touching protected paths, approved by a maintainer with "${label}":`, ...listing],
    true,
  );
}

done(
  [
    `protected-paths: ${range} is an ${agent} and touches ${String(violations.length)} protected path(s):`,
    ...listing,
    "",
    `Agents can't weaken their own guardrails. A maintainer (${context.humans.join(", ") || "repository owner"}) can approve by adding the label "${label}" after the latest push. New commits or a base-branch change void an approval: remove the label and add it again.`,
  ],
  false,
);
