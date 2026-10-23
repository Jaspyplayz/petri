import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type GuardrailsConfig, guardrailsConfigAt } from "./config.ts";
import { commitIdentities, mergeBase, readAt, resolveCommit } from "./git.ts";
import type { FileReader } from "./protected-paths.ts";
import {
  agentReasons,
  botCommitReasons,
  fetchLabelEvents,
  fetchLastHeadUpdate,
  humanMaintainers,
  labelAddedByHuman,
  type PullRequest,
  pullRequestFromEvent,
} from "./pull-request.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type CheckContext = {
  readonly root: string;
  readonly config: GuardrailsConfig;
  readonly base: string;
  readonly baseTip: string;
  readonly head: string;
  readonly pullRequest: PullRequest | undefined;
  readonly agentReasons: readonly string[];
  readonly humans: readonly string[];
  readonly read: FileReader;
  readonly humanLabel: (label: string) => Promise<boolean>;
  readonly summary: (markdown: string) => void;
};

export const repoRoot = join(import.meta.dirname, "..", "..");

const pullRequestEvents = new Set(["pull_request", "pull_request_target"]);

export function pullRequestFromEnv(env: Env): PullRequest | undefined {
  const eventName = env.GITHUB_EVENT_NAME ?? "";
  const eventPath = env.GITHUB_EVENT_PATH;
  const expected = pullRequestEvents.has(eventName);
  if (!eventPath || !existsSync(eventPath)) {
    if (expected) throw new Error(`${eventName} run without a readable event payload: can't tell who opened the PR, so the check fails`);
    return undefined;
  }
  const payload: unknown = JSON.parse(readFileSync(eventPath, "utf8"));
  const pullRequest = pullRequestFromEvent(payload);
  if (expected && !pullRequest) throw new Error(`the ${eventName} payload has no usable pull_request, so the check fails`);
  return pullRequest;
}

export function loadCheckContext(argv: readonly string[], env: Env): CheckContext {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      base: { type: "string" },
      head: { type: "string" },
      "as-agent": { type: "boolean", default: false },
    },
  });
  const root = repoRoot;
  const pullRequest = pullRequestFromEnv(env);
  const baseRef = values.base ?? pullRequest?.baseSha ?? "origin/main";
  const headRef = values.head ?? pullRequest?.headSha ?? "HEAD";
  const head = resolveCommit(root, headRef);
  const baseTip = resolveCommit(root, baseRef);
  const base = mergeBase(root, baseTip, head);
  const config = guardrailsConfigAt(root, (path) => readAt(root, baseTip, path));
  const reasons = [
    ...(pullRequest ? agentReasons(pullRequest, config) : []),
    ...botCommitReasons(commitIdentities(root, base, head), config),
    ...(values["as-agent"] ? ["--as-agent"] : []),
  ];
  const humans = humanMaintainers(env);
  const token = env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;

  return {
    root,
    config,
    base,
    baseTip,
    head,
    pullRequest,
    agentReasons: reasons,
    humans,
    read: (side, path) => readAt(root, { base, tip: baseTip, head }[side], path),
    humanLabel: async (label) => {
      if (!pullRequest?.labels.includes(label) || !token || !repository) return false;
      if (pullRequest.headRepository !== repository) return false;
      try {
        const [events, lastHeadUpdate] = await Promise.all([
          fetchLabelEvents(repository, pullRequest.number, token),
          fetchLastHeadUpdate(repository, pullRequest.headRef, token),
        ]);
        return labelAddedByHuman(label, pullRequest, events, humans, lastHeadUpdate);
      } catch (error) {
        process.stderr.write(`can't verify the "${label}" label, so it doesn't count: ${String(error)}\n`);
        return false;
      }
    },
    summary: (markdown) => {
      if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    },
  };
}

export function describeRange(context: CheckContext): string {
  const pr = context.pullRequest ? `PR #${String(context.pullRequest.number)} ` : "";
  return `${pr}${context.base.slice(0, 7)}...${context.head.slice(0, 7)}`;
}
