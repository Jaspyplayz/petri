import { lstatSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Debian 13 slim, pinned to its multi-arch index (docs/decisions.md): bash, sed and grep, no git or network tools.
export const SETUP_IMAGE = "debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad";

export type HostUser = { readonly uid: number; readonly gid: number };

// setup.sh can come from an agent (a postmortem adds cases), so it runs in a container: no network, none of the host's
// processes, environment or home folder, and the repo copy as its only writable folder, with the copy's .git read-only.
// On Linux it runs as the host user, so the files it writes stay the runner's to change and delete.
export function setupDockerArgs(caseDir: string, repo: string, user: HostUser | undefined): string[] {
  return [
    "run", "--rm", "--network", "none", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only", "--tmpfs", "/tmp",
    ...(user === undefined ? [] : ["--user", `${String(user.uid)}:${String(user.gid)}`]),
    "-v", `${repo}:/work`, "-v", `${join(repo, ".git")}:/work/.git:ro`, "-v", `${caseDir}:/case:ro`, "-w", "/work",
    SETUP_IMAGE, "bash", "/case/setup.sh",
  ];
}

export function hostUser(): HostUser | undefined {
  return process.getuid && process.getgid ? { uid: process.getuid(), gid: process.getgid() } : undefined;
}

// Code the agent runs can rewrite the copy's .git/config to name a program (core.fsmonitor, a diff or filter driver)
// for the runner's next git command to run outside any sandbox, so the runner puts back the config it wrote first. It
// removes what's there rather than writing through it, since that could be a link to a file outside the copy.
export function resetGitConfig(repo: string, config: string): void {
  const dotGit = join(repo, ".git");
  if (!lstatSync(dotGit).isDirectory()) throw new Error(`${dotGit} isn't a folder any more`);
  rmSync(join(dotGit, "config"), { recursive: true, force: true });
  writeFileSync(join(dotGit, "config"), config);
}
