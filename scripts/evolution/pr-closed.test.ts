import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { resetComment, skipReason, type ClosedGhPr } from "./pr-closed";

const config = loadGuardrailsConfig(join(import.meta.dirname, "..", ".."));

function pr(overrides: Partial<ClosedGhPr>): ClosedGhPr {
  return {
    number: 49,
    title: "feat(blob): Make the blob blink every few seconds",
    body: "",
    headRefName: "evo/47-make-the-blob-blink-every-few-seconds",
    headRefOid: "a".repeat(40),
    baseRefOid: "b".repeat(40),
    isCrossRepository: false,
    isDraft: false,
    labels: [{ name: "evolution" }, { name: "risk:low" }],
    state: "CLOSED",
    url: "https://github.com/Jaspyplayz/petri/pull/49",
    ...overrides,
  };
}

describe("skipReason", () => {
  it("resets an evolution PR closed without merging", () => {
    expect(skipReason(pr({}), config)).toBeUndefined();
    expect(skipReason(pr({ labels: [] }), config)).toBeUndefined();
  });

  it("leaves merged and open PRs alone", () => {
    expect(skipReason(pr({ state: "MERGED" }), config)).toBe("#49 is merged, not closed without merging");
    expect(skipReason(pr({ state: "OPEN" }), config)).toBe("#49 is open, not closed without merging");
  });

  it("leaves other PRs alone", () => {
    expect(skipReason(pr({ labels: [{ name: "documentation" }], headRefName: "docs/x" }), config)).toBe("#49 isn't an evolution PR");
  });
});

describe("resetComment", () => {
  it("names the PR and counts the items", () => {
    expect(resetComment(49, 1)).toBe(
      "#49 was closed without merging, so 1 feedback item is back to triaged, and the board no longer links to it. This issue stays open: dispatch the build again, or close it.",
    );
    expect(resetComment(49, 2)).toContain("so 2 feedback items are back to triaged");
  });
});
