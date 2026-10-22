import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import {
  agentReasons,
  botCommitReasons,
  fetchLabelEvents,
  fetchLastHeadUpdate,
  humanMaintainers,
  type HeadUpdate,
  type LabelEvent,
  labelAddedByHuman,
  type PullRequest,
  pullRequestFromEvent,
} from "./pull-request";

const config = loadGuardrailsConfig(repoRoot);

function eventPayload(
  overrides: { login?: string; type?: string; labels?: string[]; ref?: string; action?: string } = {},
) {
  return {
    action: overrides.action ?? "labeled",
    pull_request: {
      number: 42,
      user: { login: overrides.login ?? "Jaspyplayz", type: overrides.type ?? "User" },
      labels: (overrides.labels ?? []).map((name) => ({ name })),
      head: { ref: overrides.ref ?? "chore/thing", sha: "b".repeat(40), repo: { full_name: "Jaspyplayz/petri" } },
      base: { ref: "main", sha: "a".repeat(40) },
    },
    repository: { default_branch: "main" },
  };
}

function pullRequest(overrides: Parameters<typeof eventPayload>[0] = {}): PullRequest {
  const parsed = pullRequestFromEvent(eventPayload(overrides));
  if (!parsed) throw new Error("fixture did not parse");
  return parsed;
}

describe("pullRequestFromEvent", () => {
  it("reads the fields the checks need", () => {
    expect(pullRequest({ labels: ["evolution", "risk:low"] })).toEqual({
      action: "labeled",
      number: 42,
      author: "Jaspyplayz",
      authorIsBot: false,
      labels: ["evolution", "risk:low"],
      headRef: "chore/thing",
      headRepository: "Jaspyplayz/petri",
      baseRef: "main",
      defaultBranch: "main",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
    });
  });

  it("returns undefined for non-PR events", () => {
    expect(pullRequestFromEvent({ ref: "refs/heads/main" })).toBeUndefined();
    expect(pullRequestFromEvent(null)).toBeUndefined();
  });
});

describe("agentReasons", () => {
  it("treats a human PR without the label as human", () => {
    expect(agentReasons(pullRequest(), config)).toEqual([]);
  });

  it.each([
    [{ labels: ["evolution"] }, ['label "evolution"']],
    [{ login: "claude[bot]", type: "Bot" }, ["bot author claude[bot]"]],
    [{ login: "dependabot[bot]", type: "Bot" }, ["bot author dependabot[bot]"]],
    [{ ref: "evo/12-bigger-blob" }, ["branch evo/12-bigger-blob"]],
    [{ ref: "claude/issue-7-20261022" }, ["branch claude/issue-7-20261022"]],
  ])("flags %j", (overrides, expected) => {
    expect(agentReasons(pullRequest(overrides), config)).toEqual(expected);
  });
});

describe("botCommitReasons", () => {
  const human = { authorName: "Jasper", authorEmail: "jasper@example.com", committerName: "GitHub", committerEmail: "noreply@github.com" };

  it("ignores human commits, including ones GitHub committed for them", () => {
    expect(botCommitReasons([human], config)).toEqual([]);
  });

  it("flags any bot author or committer in the PR's commits, once each", () => {
    const claude = { ...human, authorName: "claude[bot]", authorEmail: "209825114+claude[bot]@users.noreply.github.com" };
    const actions = { ...human, committerName: "github-actions[bot]" };
    expect(botCommitReasons([human, claude, claude, actions], config)).toEqual([
      "bot commit by 209825114+claude[bot]@users.noreply.github.com",
      "bot commit by claude[bot]",
      "bot commit by github-actions[bot]",
    ]);
  });

  it("flags the configured agent identities even without a [bot] suffix", () => {
    const withAgent = { ...config, agentPullRequests: { ...config.agentPullRequests, authors: ["Petri-Agent"] } };
    expect(botCommitReasons([{ ...human, committerName: "petri-agent" }], withAgent)).toEqual(["bot commit by petri-agent"]);
  });
});

describe("humanMaintainers", () => {
  it("prefers HUMAN_MAINTAINERS and falls back to the repository owner", () => {
    expect(humanMaintainers({ HUMAN_MAINTAINERS: " alice , bob,", GITHUB_REPOSITORY_OWNER: "owner" })).toEqual(["alice", "bob"]);
    expect(humanMaintainers({ GITHUB_REPOSITORY_OWNER: "owner" })).toEqual(["owner"]);
    expect(humanMaintainers({})).toEqual([]);
  });
});

describe("labelAddedByHuman", () => {
  const pushedAt = "2026-10-22T10:00:00Z";
  const headSha = "b".repeat(40);
  const pushed = (at: string, sha = headSha): HeadUpdate => ({ at, sha });
  const labeled = (actor: string, actorType = "User", label = "protected-ok", createdAt = "2026-10-22T11:00:00Z"): LabelEvent => ({
    event: "labeled",
    label,
    actor,
    actorType,
    createdAt,
  });
  const pr = pullRequest({ labels: ["evolution", "protected-ok"] });
  const approved = (events: readonly LabelEvent[], lastHeadUpdate: HeadUpdate = pushed(pushedAt)) =>
    labelAddedByHuman("protected-ok", pr, events, ["Jaspyplayz"], lastHeadUpdate);

  it("accepts the label when a maintainer added it last, after the latest push", () => {
    expect(approved([labeled("claude[bot]", "Bot"), labeled("jaspyplayz")])).toBe(true);
  });

  it.each([
    ["a bot added it", [labeled("claude[bot]", "Bot")]],
    ["a non-maintainer added it", [labeled("someone")]],
    ["a bot re-added it after the maintainer", [labeled("Jaspyplayz"), labeled("claude[bot]", "Bot")]],
    ["there is no labeled event", []],
    ["another label was added", [labeled("Jaspyplayz", "User", "size-ok")]],
    ["the label has no timestamp", [{ ...labeled("Jaspyplayz"), createdAt: undefined }]],
  ])("rejects it when %s", (_name, events) => {
    expect(approved(events)).toBe(false);
  });

  it("voids the approval when new commits are pushed", () => {
    const synchronized = pullRequest({ labels: ["evolution", "protected-ok"], action: "synchronize" });
    expect(labelAddedByHuman("protected-ok", synchronized, [labeled("Jaspyplayz")], ["Jaspyplayz"], pushed(pushedAt))).toBe(false);
  });

  it("voids a label added before the latest push, whatever event re-runs the check", () => {
    expect(approved([labeled("Jaspyplayz")], pushed("2026-10-22T12:00:00Z"))).toBe(false);
    expect(approved([labeled("Jaspyplayz", "User", "protected-ok", pushedAt)])).toBe(false);
  });

  it("voids a label added before the base branch changed", () => {
    const retargeted: LabelEvent = { event: "base_ref_changed", label: undefined, actor: "claude[bot]", actorType: "Bot", createdAt: "2026-10-22T12:00:00Z" };
    expect(approved([labeled("Jaspyplayz"), retargeted])).toBe(false);
    expect(approved([retargeted, labeled("Jaspyplayz", "User", "protected-ok", "2026-10-22T13:00:00Z")])).toBe(true);
  });

  it("fails closed when the latest push is unknown or is not the head being checked", () => {
    expect(labelAddedByHuman("protected-ok", pr, [labeled("Jaspyplayz")], ["Jaspyplayz"], undefined)).toBe(false);
    expect(approved([labeled("Jaspyplayz")], { at: undefined, sha: headSha })).toBe(false);
    expect(approved([labeled("Jaspyplayz")], pushed(pushedAt, "c".repeat(40)))).toBe(false);
  });

  it("rejects a label that is no longer on the PR", () => {
    const unlabeled = pullRequest({ labels: ["evolution"] });
    expect(labelAddedByHuman("protected-ok", unlabeled, [labeled("Jaspyplayz")], ["Jaspyplayz"], pushed(pushedAt))).toBe(false);
  });
});

describe("fetchLabelEvents", () => {
  it("pages through the issue events API", async () => {
    const urls: string[] = [];
    const firstPage = Array.from({ length: 100 }, () => ({ event: "commented", actor: { login: "x", type: "User" } }));
    const secondPage = [{ event: "labeled", label: { name: "size-ok" }, actor: { login: "Jaspyplayz", type: "User" } }];
    const fakeFetch: typeof fetch = (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      return Promise.resolve(Response.json(urls.length === 1 ? firstPage : secondPage));
    };
    const events = await fetchLabelEvents("Jaspyplayz/petri", 42, "token", fakeFetch);
    expect(urls).toEqual([
      "https://api.github.com/repos/Jaspyplayz/petri/issues/42/events?per_page=100&page=1",
      "https://api.github.com/repos/Jaspyplayz/petri/issues/42/events?per_page=100&page=2",
    ]);
    expect(events.at(-1)).toEqual({ event: "labeled", label: "size-ok", actor: "Jaspyplayz", actorType: "User", createdAt: undefined });
  });

  it("fails closed on API errors", async () => {
    const failing: typeof fetch = () => Promise.resolve(new Response("nope", { status: 403 }));
    await expect(fetchLabelEvents("o/r", 1, "t", failing)).rejects.toThrow("GitHub API 403");
  });

  it("fails closed when there are too many events to read the newest ones", async () => {
    const fullPage = Array.from({ length: 100 }, () => ({ event: "commented", actor: { login: "x", type: "User" } }));
    const endless: typeof fetch = () => Promise.resolve(Response.json(fullPage));
    await expect(fetchLabelEvents("o/r", 1, "t", endless)).rejects.toThrow("no approval counts");
  });
});

describe("fetchLastHeadUpdate", () => {
  it("reads the newest activity on the head branch", async () => {
    const urls: string[] = [];
    const fakeFetch: typeof fetch = (input) => {
      urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return Promise.resolve(Response.json([{ activity_type: "push", timestamp: "2026-10-22T10:00:00Z", after: "b".repeat(40) }]));
    };
    expect(await fetchLastHeadUpdate("Jaspyplayz/petri", "evo/12-blob", "token", fakeFetch)).toEqual({
      at: "2026-10-22T10:00:00Z",
      sha: "b".repeat(40),
    });
    expect(urls).toEqual([
      "https://api.github.com/repos/Jaspyplayz/petri/activity?ref=refs%2Fheads%2Fevo%2F12-blob&direction=desc&per_page=1",
    ]);
  });

  it("returns undefined when the branch has no activity and throws on API errors", async () => {
    const empty: typeof fetch = () => Promise.resolve(Response.json([]));
    expect(await fetchLastHeadUpdate("o/r", "x", "t", empty)).toBeUndefined();
    const failing: typeof fetch = () => Promise.resolve(new Response("nope", { status: 404 }));
    await expect(fetchLastHeadUpdate("o/r", "x", "t", failing)).rejects.toThrow("GitHub API 404");
  });
});
