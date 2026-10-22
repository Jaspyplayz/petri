import type { GuardrailsConfig } from "./config.ts";
import { asRecord } from "./json.ts";

export type PullRequest = {
  readonly action: string | undefined;
  readonly number: number;
  readonly author: string;
  readonly authorIsBot: boolean;
  readonly labels: readonly string[];
  readonly headRef: string;
  readonly baseSha: string;
  readonly headSha: string;
};

export type LabelEvent = {
  readonly event: string;
  readonly label: string | undefined;
  readonly actor: string | undefined;
  readonly actorType: string | undefined;
};

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
): boolean {
  if (pullRequest.action === "synchronize" || !pullRequest.labels.includes(label)) return false;
  const lastLabeled = events.filter((event) => event.event === "labeled" && event.label === label).at(-1);
  if (!lastLabeled?.actor || lastLabeled.actorType !== "User") return false;
  const actor = lastLabeled.actor.toLowerCase();
  return humans.some((human) => human.toLowerCase() === actor);
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
      },
    ];
  });
}

export async function fetchLabelEvents(
  repository: string,
  pullNumber: number,
  token: string,
  fetchPage: typeof fetch = fetch,
): Promise<LabelEvent[]> {
  const events: LabelEvent[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetchPage(
      `https://api.github.com/repos/${repository}/issues/${String(pullNumber)}/events?per_page=100&page=${String(page)}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
      },
    );
    if (!response.ok) throw new Error(`GitHub API ${String(response.status)} while reading issue events`);
    const body: unknown = await response.json();
    const batch = labelEventsFromApi(body);
    events.push(...batch);
    if (!Array.isArray(body) || body.length < 100) break;
  }
  return events;
}
