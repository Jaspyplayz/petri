import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fingerprintFiles, isBuildInput, sourceFingerprint } from "./fingerprint";

const repos: string[] = [];

function repoWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fingerprint-"));
  repos.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  return root;
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

afterEach(() => {
  for (const root of repos.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("isBuildInput", () => {
  it.each(["src/app/page.tsx", "src/features/blob/lib/blob-state.ts", "public/logo.svg", "next.config.ts", "package.json", "pnpm-lock.yaml", "tsconfig.json"])(
    "counts %s",
    (path) => {
      expect(isBuildInput(path)).toBe(true);
    },
  );

  it.each(["src/features/blob/tests/blob-state.test.ts", "src/features/blob/tests/blob.e2e.ts", "src/features/blob/README.md", "docs/architecture.md", "scripts/verify.ts", "PROGRESS.md", ".env.example"])(
    "ignores %s",
    (path) => {
      expect(isBuildInput(path)).toBe(false);
    },
  );
});

describe("fingerprintFiles", () => {
  it("ignores the order files are listed in", () => {
    const a = { path: "a.ts", content: "1" };
    const b = { path: "b.ts", content: "2" };
    expect(fingerprintFiles([a, b])).toBe(fingerprintFiles([b, a]));
  });

  it("changes when a path or its content changes", () => {
    const base = fingerprintFiles([{ path: "a.ts", content: "1" }]);
    expect(fingerprintFiles([{ path: "a.ts", content: "2" }])).not.toBe(base);
    expect(fingerprintFiles([{ path: "b.ts", content: "1" }])).not.toBe(base);
    expect(fingerprintFiles([{ path: "a.ts", content: "1" }, { path: "c.ts", content: "" }])).not.toBe(base);
  });
});

describe("sourceFingerprint", () => {
  it("changes for tracked, untracked and env files that the build reads", () => {
    const root = repoWith({ "src/app/page.tsx": "one", ".gitignore": ".env*\nignored/\n" });
    execFileSync("git", ["add", "-A"], { cwd: root });
    const base = sourceFingerprint(root);

    write(root, "src/app/page.tsx", "two");
    const edited = sourceFingerprint(root);
    expect(edited).not.toBe(base);

    write(root, "src/app/new.tsx", "untracked");
    const added = sourceFingerprint(root);
    expect(added).not.toBe(edited);

    write(root, ".env.local", "NEXT_PUBLIC_X=1");
    expect(sourceFingerprint(root)).not.toBe(added);
  });

  it("stays the same for files the build doesn't read", () => {
    const root = repoWith({ "src/app/page.tsx": "one", ".gitignore": "ignored/\n" });
    const base = sourceFingerprint(root);
    write(root, "src/app/page.test.ts", "test");
    write(root, "docs/notes.md", "notes");
    write(root, "ignored/src/app/page.tsx", "ignored");
    expect(sourceFingerprint(root)).toBe(base);
  });

  it("handles a tracked file deleted from the working tree", () => {
    const root = repoWith({ "src/app/page.tsx": "one", "src/app/gone.tsx": "gone" });
    execFileSync("git", ["add", "-A"], { cwd: root });
    const base = sourceFingerprint(root);
    rmSync(join(root, "src/app/gone.tsx"));
    expect(sourceFingerprint(root)).not.toBe(base);
  });
});
