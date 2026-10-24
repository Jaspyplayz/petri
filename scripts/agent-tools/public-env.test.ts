import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextConfigEnvKeys, publicEnvProblems } from "./public-env";

const root = join(import.meta.dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|mts|js|mjs)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("publicEnvProblems", () => {
  it("allows the Supabase URL, the anon key, the Sentry DSN and the build metadata", () => {
    const text = "env.NEXT_PUBLIC_SUPABASE_URL; env.NEXT_PUBLIC_SUPABASE_ANON_KEY; NEXT_PUBLIC_SENTRY_DSN; NEXT_PUBLIC_COMMIT_SHA; NEXT_PUBLIC_VERCEL_ENV";
    expect(publicEnvProblems("a.ts", text)).toEqual([]);
  });

  it("refuses any other NEXT_PUBLIC_ name", () => {
    expect(publicEnvProblems("a.ts", "process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY")).toEqual([
      "a.ts: NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY would be sent to the browser; only NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_COMMIT_SHA, NEXT_PUBLIC_VERCEL_ENV may be",
    ]);
  });

  it("refuses a next.config env key that isn't allowed, whatever its name", () => {
    const config = 'const c = { env: {\n  NEXT_PUBLIC_COMMIT_SHA: sha,\n  "RATE_LIMIT_SALT": process.env.RATE_LIMIT_SALT ?? "",\n}, poweredByHeader: false };';
    expect(nextConfigEnvKeys(config)).toEqual(["NEXT_PUBLIC_COMMIT_SHA", "RATE_LIMIT_SALT"]);
    expect(publicEnvProblems("next.config.ts", config, true)).toEqual(["next.config.ts: next.config env exposes RATE_LIMIT_SALT to the browser"]);
  });
});

describe("the app's public env", () => {
  it("is only the allowed names, in src/ (instrumentation included) and next.config.ts", () => {
    const files = sourceFiles("src");
    const problems = [
      ...files.flatMap((file) => publicEnvProblems(file, readFileSync(file, "utf8"))),
      ...publicEnvProblems("next.config.ts", readFileSync(join(root, "next.config.ts"), "utf8"), true),
    ];
    expect(files.length).toBeGreaterThan(50);
    expect(problems).toEqual([]);
  });
});
