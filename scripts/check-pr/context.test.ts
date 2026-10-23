import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pullRequestFromEnv } from "./context";

const dir = mkdtempSync(join(tmpdir(), "guardrails-event-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function payloadFile(name: string, payload: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

const pullRequestPayload = {
  action: "opened",
  pull_request: {
    number: 7,
    user: { login: "claude[bot]", type: "Bot" },
    labels: [],
    head: { ref: "claude/x", sha: "b".repeat(40), repo: { full_name: "Jaspyplayz/petri" } },
    base: { ref: "main", sha: "a".repeat(40) },
  },
};

describe("pullRequestFromEnv", () => {
  it("reads the PR from a pull_request_target payload", () => {
    const env = { GITHUB_EVENT_NAME: "pull_request_target", GITHUB_EVENT_PATH: payloadFile("pr.json", pullRequestPayload) };
    expect(pullRequestFromEnv(env)?.author).toBe("claude[bot]");
  });

  it("treats local runs and push events as no PR", () => {
    expect(pullRequestFromEnv({})).toBeUndefined();
    expect(pullRequestFromEnv({ GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: payloadFile("push.json", { ref: "refs/heads/main" }) })).toBeUndefined();
  });

  it.each(["pull_request", "pull_request_target"])("fails closed when a %s run has no usable payload", (event) => {
    expect(() => pullRequestFromEnv({ GITHUB_EVENT_NAME: event })).toThrow(/without a readable event payload/);
    expect(() => pullRequestFromEnv({ GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: join(dir, "missing.json") })).toThrow(
      /without a readable event payload/,
    );
    expect(() => pullRequestFromEnv({ GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: payloadFile(`${event}-empty.json`, { action: "opened" }) })).toThrow(
      /no usable pull_request/,
    );
  });
});
