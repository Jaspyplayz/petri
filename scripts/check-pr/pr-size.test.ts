import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig, parseGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import { measurePullRequest } from "./pr-size";

const { ignoredPaths, maxChangedLines } = loadGuardrailsConfig(repoRoot).prSize;

describe("measurePullRequest", () => {
  it("counts added plus deleted lines, skipping lockfiles, generated types and binaries", () => {
    const report = measurePullRequest(
      [
        { path: "src/features/blob/components/blob-creature.tsx", added: 120, deleted: 30 },
        { path: "src/features/blob/lib/blob-state.ts", added: 10, deleted: 0 },
        { path: "pnpm-lock.yaml", added: 5000, deleted: 200 },
        { path: "src/shared/supabase/database.types.ts", added: 300, deleted: 0 },
        { path: "FEATURE_MAP.md", added: 40, deleted: 2 },
        { path: "public/blob.png", added: null, deleted: null },
      ],
      ignoredPaths,
    );
    expect(report.total).toBe(160);
    expect(report.counted.map((file) => file.path)).toEqual([
      "src/features/blob/components/blob-creature.tsx",
      "src/features/blob/lib/blob-state.ts",
    ]);
    expect(report.ignored).toEqual(["pnpm-lock.yaml", "src/shared/supabase/database.types.ts", "FEATURE_MAP.md"]);
    expect(report.binary).toEqual(["public/blob.png"]);
  });

  it("uses a limit of about 400 lines", () => {
    expect(maxChangedLines).toBe(400);
  });
});

describe("parseGuardrailsConfig", () => {
  it("rejects a config with missing or mistyped fields", () => {
    expect(() => parseGuardrailsConfig("[]")).toThrow(/JSON object/);
    expect(() => parseGuardrailsConfig('{"protectedPaths": "nope"}')).toThrow(/agentPullRequests must be an object/);
  });
});
