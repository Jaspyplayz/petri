import { spawnSync } from "node:child_process";

export type ChangeStatus = "added" | "modified" | "deleted";

export type ChangedFile = {
  readonly path: string;
  readonly status: ChangeStatus;
};

export type NumstatEntry = {
  readonly path: string;
  readonly added: number | null;
  readonly deleted: number | null;
};

function git(cwd: string, args: readonly string[]): { readonly ok: boolean; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

function gitOrThrow(cwd: string, args: readonly string[]): string {
  const result = git(cwd, args);
  if (!result.ok) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

const STATUS_BY_LETTER: Readonly<Record<string, ChangeStatus>> = { A: "added", M: "modified", T: "modified", D: "deleted" };

export function parseNameStatusZ(output: string): ChangedFile[] {
  const fields = output.split("\0").filter((field) => field !== "");
  const changes: ChangedFile[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const letter = (fields[index] ?? "").charAt(0);
    const path = fields[index + 1] ?? "";
    const status = STATUS_BY_LETTER[letter];
    if (!status) throw new Error(`Unexpected git status "${letter}" for ${path}`);
    changes.push({ path, status });
  }
  return changes;
}

export function parseNumstatZ(output: string): NumstatEntry[] {
  return output
    .split("\0")
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [added = "", deleted = "", ...pathParts] = record.replace(/^\n/, "").split("\t");
      return {
        path: pathParts.join("\t"),
        added: added === "-" ? null : Number(added),
        deleted: deleted === "-" ? null : Number(deleted),
      };
    });
}

export function resolveCommit(cwd: string, ref: string): string {
  return gitOrThrow(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
}

export function mergeBase(cwd: string, base: string, head: string): string {
  return gitOrThrow(cwd, ["merge-base", base, head]).trim();
}

export function changedFiles(cwd: string, from: string, to: string): ChangedFile[] {
  return parseNameStatusZ(gitOrThrow(cwd, ["diff", "--name-status", "--no-renames", "-z", from, to]));
}

export function numstat(cwd: string, from: string, to: string): NumstatEntry[] {
  return parseNumstatZ(gitOrThrow(cwd, ["diff", "--numstat", "--no-renames", "-z", from, to]));
}

export function readAt(cwd: string, commit: string, path: string): string | undefined {
  const result = git(cwd, ["show", `${commit}:${path}`]);
  return result.ok ? result.stdout : undefined;
}
