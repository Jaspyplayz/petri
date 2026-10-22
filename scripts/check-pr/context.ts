import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type GuardrailsConfig, guardrailsConfigAt } from "./config.ts";
import { mergeBase, readAt, resolveCommit } from "./git.ts";
import type { FileReader } from "./protected-paths.ts";
import {
  agentReasons,
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
  readonly head: string;
  readonly pullRequest: PullRequest | undefined;
  readonly agentReasons: readonly string[];
  readonly humans: readonly string[];
  readonly read: FileReader;
  readonly humanLabel: (label: string) => Promise<boolean>;
  readonly summary: (markdown: string) => void;
};

export const repoRoot = join(import.meta.dirname, "..", "..");

function pullRequestFromEnv(env: Env): PullRequest | undefined {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return undefined;
  const payload: unknown = JSON.parse(readFileSync(eventPath, "utf8"));
  return pullRequestFromEvent(payload);
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
  const base = mergeBase(root, resolveCommit(root, baseRef), head);
  const config = guardrailsConfigAt(root, (path) => readAt(root, base, path));
  const reasons = [
    ...(pullRequest ? agentReasons(pullRequest, config) : []),
    ...(values["as-agent"] ? ["--as-agent"] : []),
  ];
  const humans = humanMaintainers(env);
  const token = env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;

  return {
    root,
    config,
    base,
    head,
    pullRequest,
    agentReasons: reasons,
    humans,
    read: (side, path) => readAt(root, side === "base" ? base : head, path),
    humanLabel: async (label) => {
      if (!pullRequest?.labels.includes(label) || !token || !repository) return false;
      if (pullRequest.headRepository !== repository) return false;
      const [events, lastHeadUpdate] = await Promise.all([
        fetchLabelEvents(repository, pullRequest.number, token),
        fetchLastHeadUpdate(repository, pullRequest.headRef, token),
      ]);
      return labelAddedByHuman(label, pullRequest, events, humans, lastHeadUpdate);
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
