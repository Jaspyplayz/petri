import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { POSTMORTEM_LABEL } from "../evolution/postmortem";

const root = join(import.meta.dirname, "..", "..");

// The Claude review runs with a token on what the PR says. Agent PRs carry text an agent wrote, so the review skips
// every branch prefix and label guardrails counts as an agent's, and the postmortem label.
describe("claude-code-review.yml", () => {
  const workflow = load(readFileSync(join(root, ".github", "workflows", "claude-code-review.yml"), "utf8")) as {
    readonly jobs: Readonly<Record<string, { readonly if?: string }>>;
  };
  const condition = workflow.jobs["claude-review"]?.if ?? "";

  it("skips every agent branch prefix in .github/guardrails.json", () => {
    for (const prefix of loadGuardrailsConfig(root).agentPullRequests.branchPrefixes) {
      expect(condition).toContain(`!startsWith(github.head_ref, '${prefix}')`);
    }
  });

  it("skips the agent labels and the postmortem label", () => {
    for (const label of [...loadGuardrailsConfig(root).agentPullRequests.labels, POSTMORTEM_LABEL]) {
      expect(condition).toContain(`!contains(github.event.pull_request.labels.*.name, '${label}')`);
    }
  });
});
