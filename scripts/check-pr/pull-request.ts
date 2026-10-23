import type { GuardrailsConfig } from "./config.ts";
import type { CommitIdentity } from "./git.ts";
import { asRecord } from "./json.ts";

export type PullRequest = {
  readonly action: string | undefined;
  readonly number: number;
  readonly author: string;
  readonly authorIsBot: boolean;
  readonly labels: readonly string[];
  readonly headRef: string;
  readonly headRepository: string | undefined;
  readonly baseRef: string | undefined;
  readonly defaultBranch: string | undefined;
  readonly baseSha: string;
  readonly headSha: string;
};

export type LabelEvent = {
  readonly event: string;
  readonly label: string | undefined;
  readonly actor: string | undefined;
  readonly actorType: string | undefined;
  readonly createdAt: string | undefined;
};

export type HeadUpdate = {
  readonly at: string | undefined;
  readonly sha: string | undefined;
};

type FetchPage = typeof fetch;

const maxEventPages = 50;

const approvalVoidingEvents = new Set(["base_ref_changed", "head_ref_force_pushed", "head_ref_restored"]);

function stringAt(record: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

export function pullRequestFromEvent(payload: unknown): PullRequest | undefined {
  const event = asRecord(payload);
  const pullRequest = asRecord(event?.pull_request);
  if (!pullRequest) return undefined;
  const user = asRecord(pullRequest.user);
  const head = asRecord(pullRequest.head);
  const base = asRecord(pullRequest.base);
  const labelsValue = pullRequest.labels;
  const labelItems: unknown[] = Array.isArray(labelsValue) ? labelsValue : [];
  const number = pullRequest.number;
  const author = stringAt(user, "login");
  const headRef = stringAt(head, "ref");
  const headSha = stringAt(head, "sha");
  const baseSha = stringAt(base, "sha");
  if (typeof number !== "number" || !author || !headRef || !headSha || !baseSha) return undefined;
  return {
    action: stringAt(event, "action"),
    number,
    author,
    authorIsBot: stringAt(user, "type") === "Bot" || author.endsWith("[bot]"),
    labels: labelItems.flatMap((label) => {
      const name = stringAt(asRecord(label), "name");
      return name === undefined ? [] : [name];
    }),
    headRef,
    headRepository: stringAt(asRecord(head?.repo), "full_name"),
    baseRef: stringAt(base, "ref"),
    defaultBranch: stringAt(asRecord(event?.repository), "default_branch"),
    baseSha,
    headSha,
  };
}

export function agentReasons(pullRequest: PullRequest, config: GuardrailsConfig): string[] {
  const { labels, branchPrefixes, authors } = config.agentPullRequests;
  const reasons: string[] = [];
  for (const label of labels) {
    if (pullRequest.labels.includes(label)) reasons.push(`label "${label}"`);
  }
  const knownAgent = authors.some((author) => author.toLowerCase() === pullRequest.author.toLowerCase());
  if (knownAgent || pullRequest.authorIsBot) reasons.push(`bot author ${pullRequest.author}`);
  const prefix = branchPrefixes.find((candidate) => pullRequest.headRef.startsWith(candidate));
  if (prefix !== undefined) reasons.push(`branch ${pullRequest.headRef}`);
  return reasons;
}

export function botCommitReasons(identities: readonly CommitIdentity[], config: GuardrailsConfig): string[] {
  const agents = config.agentPullRequests.authors.map((author) => author.toLowerCase());
  const bots = new Set<string>();
  for (const identity of identities) {
    for (const name of [identity.authorName, identity.authorEmail, identity.committerName, identity.committerEmail]) {
      const lower = name.toLowerCase();
      if (lower.includes("[bot]") || agents.includes(lower)) bots.add(name);
    }
  }
  return [...bots].sort().map((name) => `bot commit by ${name}`);
}

export function humanMaintainers(env: Readonly<Record<string, string | undefined>>): string[] {
  const listed = (env.HUMAN_MAINTAINERS ?? "")
    .split(",")
    .map((login) => login.trim())
    .filter((login) => login !== "");
  if (listed.length > 0) return listed;
  return env.GITHUB_REPOSITORY_OWNER ? [env.GITHUB_REPOSITORY_OWNER] : [];
}

export function labelAddedByHuman(
  label: string,
  pullRequest: PullRequest,
  events: readonly LabelEvent[],
  humans: readonly string[],
  lastHeadUpdate: HeadUpdate | undefined,
): boolean {
  if (pullRequest.action === "synchronize" || !pullRequest.labels.includes(label)) return false;
  if (lastHeadUpdate?.sha !== pullRequest.headSha) return false;
  const lastLabeled = events.filter((event) => event.event === "labeled" && event.label === label).at(-1);
  if (!lastLabeled?.actor || lastLabeled.actorType !== "User") return false;
  const actor = lastLabeled.actor.toLowerCase();
  if (!humans.some((human) => human.toLowerCase() === actor)) return false;
  const labeledAt = Date.parse(lastLabeled.createdAt ?? "");
  const voidedAt = [lastHeadUpdate.at, ...events.filter((event) => approvalVoidingEvents.has(event.event)).map((event) => event.createdAt)].map(
    (time) => Date.parse(time ?? ""),
  );
  if (Number.isNaN(labeledAt) || voidedAt.some((time) => Number.isNaN(time))) return false;
  return voidedAt.every((time) => labeledAt > time);
}

export function labelEventsFromApi(page: unknown): LabelEvent[] {
  const items: unknown[] = Array.isArray(page) ? page : [];
  return items.flatMap((item) => {
    const record = asRecord(item);
    const event = stringAt(record, "event");
    if (event === undefined) return [];
    const actor = asRecord(record?.actor);
    return [
      {
        event,
        label: stringAt(asRecord(record?.label), "name"),
        actor: stringAt(actor, "login"),
        actorType: stringAt(actor, "type"),
        createdAt: stringAt(record, "created_at"),
      },
    ];
  });
}

async function githubGet(url: string, token: string, what: string, fetchPage: FetchPage): Promise<unknown> {
  const response = await fetchPage(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${String(response.status)} while reading ${what}`);
  return response.json();
}

export async function fetchLabelEvents(
  repository: string,
  pullNumber: number,
  token: string,
  fetchPage: FetchPage = fetch,
): Promise<LabelEvent[]> {
  const events: LabelEvent[] = [];
  for (let page = 1; page <= maxEventPages; page += 1) {
    const body = await githubGet(
      `https://api.github.com/repos/${repository}/issues/${String(pullNumber)}/events?per_page=100&page=${String(page)}`,
      token,
      "issue events",
      fetchPage,
    );
    events.push(...labelEventsFromApi(body));
    if (!Array.isArray(body) || body.length < 100) return events;
  }
  throw new Error(`more than ${String(maxEventPages * 100)} issue events: can't see the newest label events, so no approval counts`);
}

export async function fetchLastHeadUpdate(
  repository: string,
  headRef: string,
  token: string,
  fetchPage: FetchPage = fetch,
): Promise<HeadUpdate | undefined> {
  const ref = encodeURIComponent(`refs/heads/${headRef}`);
  const body = await githubGet(
    `https://api.github.com/repos/${repository}/activity?ref=${ref}&direction=desc&per_page=1`,
    token,
    "repository activity",
    fetchPage,
  );
  const latest = asRecord(Array.isArray(body) ? body[0] : undefined);
  if (!latest) return undefined;
  return { at: stringAt(latest, "timestamp"), sha: stringAt(latest, "after") };
}
