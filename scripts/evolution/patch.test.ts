import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { patchProblems } from "./patch";

const config = loadGuardrailsConfig(join(import.meta.dirname, "..", ".."));

describe("patchProblems", () => {
  it("passes a small change inside a feature", () => {
    expect(patchProblems([{ path: "src/features/blob/components/blob-creature.tsx", added: 12, deleted: 3 }], config)).toEqual([]);
  });

  it("refuses protected paths, binaries, oversize and empty patches", () => {
    expect(patchProblems([{ path: ".github/workflows/ci.yml", added: 1, deleted: 1 }], config)).toEqual([".github/workflows/ci.yml is a protected path"]);
    expect(patchProblems([{ path: "scripts/check.ts", added: 1, deleted: 0 }], config)).toEqual(["scripts/check.ts is a protected path"]);
    expect(patchProblems([{ path: "src/features/blob/hat.png", added: null, deleted: null }], config)).toEqual(["src/features/blob/hat.png is binary"]);
    expect(patchProblems([{ path: "src/features/blob/lib/big.ts", added: 401, deleted: 0 }], config)).toEqual([
      "401 changed lines is over the 400-line cap for agent PRs",
    ]);
    expect(patchProblems([], config)).toEqual(["the patch changes nothing"]);
  });

  it("doesn't count generated files toward the cap", () => {
    expect(patchProblems([{ path: "FEATURE_MAP.md", added: 900, deleted: 0 }], config)).toEqual([]);
  });
});
