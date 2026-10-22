import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { changedFiles, mergeBase, numstat, parseNameStatusZ, parseNumstatZ, readAt, resolveCommit } from "./git";

describe("parsers", () => {
  it("parses NUL-separated name-status output", () => {
    expect(parseNameStatusZ("M\0a.ts\0A\0dir/with space.ts\0D\0gone.ts\0T\0link\0")).toEqual([
      { path: "a.ts", status: "modified" },
      { path: "dir/with space.ts", status: "added" },
      { path: "gone.ts", status: "deleted" },
      { path: "link", status: "modified" },
    ]);
    expect(() => parseNameStatusZ("R100\0a\0")).toThrow(/Unexpected git status/);
  });

  it("parses NUL-separated numstat output, including binary files", () => {
    expect(parseNumstatZ("3\t1\ta.ts\0-\t-\timage.png\0")).toEqual([
      { path: "a.ts", added: 3, deleted: 1 },
      { path: "image.png", added: null, deleted: null },
    ]);
  });
});

describe("against a real repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "guardrails-git-"));
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  run("init", "-q", "-b", "main");
  run("config", "user.email", "test@example.com");
  run("config", "user.name", "Test");
  run("config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "keep.txt"), "one\n");
  writeFileSync(join(dir, "gone.txt"), "bye\n");
  run("add", ".");
  run("commit", "-q", "-m", "base");
  run("checkout", "-q", "-b", "feature");
  writeFileSync(join(dir, "keep.txt"), "one\ntwo\n");
  writeFileSync(join(dir, "new file.txt"), "a\nb\nc\n");
  unlinkSync(join(dir, "gone.txt"));
  run("add", "-A");
  run("commit", "-q", "-m", "feature");
  run("checkout", "-q", "main");
  writeFileSync(join(dir, "main-only.txt"), "x\n");
  run("add", ".");
  run("commit", "-q", "-m", "main moves on");

  it("diffs a branch against its merge base, ignoring later main commits", () => {
    const head = resolveCommit(dir, "feature");
    const base = mergeBase(dir, resolveCommit(dir, "main"), head);
    expect(changedFiles(dir, base, head)).toEqual([
      { path: "gone.txt", status: "deleted" },
      { path: "keep.txt", status: "modified" },
      { path: "new file.txt", status: "added" },
    ]);
    expect(numstat(dir, base, head)).toEqual([
      { path: "gone.txt", added: 0, deleted: 1 },
      { path: "keep.txt", added: 1, deleted: 0 },
      { path: "new file.txt", added: 3, deleted: 0 },
    ]);
    expect(readAt(dir, base, "gone.txt")).toBe("bye\n");
    expect(readAt(dir, head, "gone.txt")).toBeUndefined();
  });
});
