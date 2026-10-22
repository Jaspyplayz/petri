import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import {
  agentReasons,
  fetchLabelEvents,
  humanMaintainers,
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
      head: { ref: overrides.ref ?? "chore/thing", sha: "b".repeat(40) },
      base: { ref: "main", sha: "a".repeat(40) },
    },
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
  ])("flags %j", (overrides, expected) => {
    expect(agentReasons(pullRequest(overrides), config)).toEqual(expected);
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
  const labeled = (actor: string, actorType = "User", label = "protected-ok"): LabelEvent => ({
    event: "labeled",
    label,
    actor,
    actorType,
  });
  const pr = pullRequest({ labels: ["evolution", "protected-ok"] });

  it("accepts the label when a maintainer added it last", () => {
    expect(labelAddedByHuman("protected-ok", pr, [labeled("claude[bot]", "Bot"), labeled("jaspyplayz")], ["Jaspyplayz"])).toBe(true);
  });

  it.each([
    ["a bot added it", [labeled("claude[bot]", "Bot")]],
    ["a non-maintainer added it", [labeled("someone")]],
    ["a bot re-added it after the maintainer", [labeled("Jaspyplayz"), labeled("claude[bot]", "Bot")]],
    ["there is no labeled event", []],
    ["another label was added", [labeled("Jaspyplayz", "User", "size-ok")]],
  ])("rejects it when %s", (_name, events) => {
    expect(labelAddedByHuman("protected-ok", pr, events, ["Jaspyplayz"])).toBe(false);
  });

  it("voids the approval when new commits are pushed", () => {
    const pushed = pullRequest({ labels: ["evolution", "protected-ok"], action: "synchronize" });
    expect(labelAddedByHuman("protected-ok", pushed, [labeled("Jaspyplayz")], ["Jaspyplayz"])).toBe(false);
  });

  it("rejects a label that is no longer on the PR", () => {
    expect(labelAddedByHuman("protected-ok", pullRequest({ labels: ["evolution"] }), [labeled("Jaspyplayz")], ["Jaspyplayz"])).toBe(false);
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
    expect(events.at(-1)).toEqual({ event: "labeled", label: "size-ok", actor: "Jaspyplayz", actorType: "User" });
  });

  it("fails closed on API errors", async () => {
    const failing: typeof fetch = () => Promise.resolve(new Response("nope", { status: 403 }));
    await expect(fetchLabelEvents("o/r", 1, "t", failing)).rejects.toThrow("GitHub API 403");
  });
});
