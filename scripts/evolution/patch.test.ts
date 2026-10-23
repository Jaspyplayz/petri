import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "../check-pr/config";
import { parseRawZ, patchProblems, type RawChange } from "./patch";

const config = loadGuardrailsConfig(join(import.meta.dirname, "..", ".."));

function added(path: string, mode = "100644"): RawChange {
  return { oldMode: "000000", newMode: mode, status: "A", path };
}

describe("parseRawZ", () => {
  it("reads modes, status and path from git diff-index --raw -z", () => {
    const sha = "0".repeat(40);
    expect(parseRawZ(`:000000 100644 ${sha} ${sha} A\0src/a.ts\0:100644 120000 ${sha} ${sha} M\0src/b.ts\0`)).toEqual([
      { oldMode: "000000", newMode: "100644", status: "A", path: "src/a.ts" },
      { oldMode: "100644", newMode: "120000", status: "M", path: "src/b.ts" },
    ]);
    expect(parseRawZ("")).toEqual([]);
  });
});

describe("patchProblems", () => {
  const lines = (path: string, count: number) => [{ path, added: count, deleted: 0 }];

  it("passes a small change inside a feature", () => {
    expect(patchProblems([added("src/features/blob/lib/hat.ts")], lines("src/features/blob/lib/hat.ts", 12), config)).toEqual([]);
  });

  it("refuses protected paths, symlinks, submodules, executables and odd statuses", () => {
    expect(patchProblems([added("scripts/check.ts")], lines("scripts/check.ts", 1), config)).toEqual(["scripts/check.ts is a protected path"]);
    expect(patchProblems([added("src/features/blob/link", "120000")], [], config)).toEqual(["src/features/blob/link isn't a plain file (mode 000000 → 120000)"]);
    expect(patchProblems([added("src/features/blob/sub", "160000")], [], config)).toHaveLength(1);
    expect(patchProblems([{ oldMode: "100644", newMode: "100755", status: "M", path: "src/features/blob/x.ts" }], [], config)).toHaveLength(1);
    expect(patchProblems([{ ...added("src/features/blob/x.ts"), status: "T" }], [], config)).toEqual(["src/features/blob/x.ts has git status T"]);
  });

  it("refuses binaries, oversize and empty patches, and doesn't count generated files", () => {
    expect(patchProblems([added("src/features/blob/hat.png")], [{ path: "src/features/blob/hat.png", added: null, deleted: null }], config)).toEqual([
      "src/features/blob/hat.png is binary",
    ]);
    expect(patchProblems([added("src/features/blob/lib/big.ts")], lines("src/features/blob/lib/big.ts", 401), config)).toEqual([
      "401 changed lines is over the 400-line cap for agent PRs",
    ]);
    expect(patchProblems([], [], config)).toEqual(["the patch changes nothing"]);
    expect(patchProblems([added("FEATURE_MAP.md")], lines("FEATURE_MAP.md", 900), config)).toEqual([]);
  });
});
