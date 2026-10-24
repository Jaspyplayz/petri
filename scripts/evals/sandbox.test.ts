import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SETUP_IMAGE, resetGitConfig, setupDockerArgs } from "./sandbox";

const scratch = mkdtempSync(join(tmpdir(), "petri-sandbox-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function copy(name: string): string {
  const repo = join(scratch, name);
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(join(repo, ".git", "config"), "[core]\n\tfsmonitor = ./steal.sh\n");
  return repo;
}

const CONFIG = "[core]\n\trepositoryformatversion = 0\n";

describe("setupDockerArgs", () => {
  const args = setupDockerArgs("/evals/x/cases/01-a", "/tmp/petri-work-1/petri", undefined);

  it("runs setup.sh with no network, no capabilities, a read-only root and the copy's .git read-only", () => {
    expect(args.slice(0, 2)).toEqual(["run", "--rm"]);
    for (const pair of [["--network", "none"], ["--cap-drop", "ALL"], ["--security-opt", "no-new-privileges"], ["--tmpfs", "/tmp"]]) {
      expect(args.join(" ")).toContain(pair.join(" "));
    }
    expect(args).toContain("--read-only");
    expect(args).toContain("/tmp/petri-work-1/petri:/work");
    expect(args).toContain(`${join("/tmp/petri-work-1/petri", ".git")}:/work/.git:ro`);
    expect(args).toContain("/evals/x/cases/01-a:/case:ro");
    expect(args.slice(-3)).toEqual([SETUP_IMAGE, "bash", "/case/setup.sh"]);
  });

  it("passes none of the host's environment, devices or privileges, and pins the image", () => {
    expect(args.filter((arg) => /^(-e|--env|--env-file|--privileged|--device|--pid|--ipc|--net(work)?=host|-p|--publish)$/.test(arg))).toEqual([]);
    expect(SETUP_IMAGE).toMatch(/@sha256:[0-9a-f]{64}$/);
  });

  it("runs as the host user where there is one", () => {
    expect(args).not.toContain("--user");
    expect(setupDockerArgs("c", "r", { uid: 1001, gid: 118 }).join(" ")).toContain("--user 1001:118");
  });
});

describe("resetGitConfig", () => {
  it("puts back the runner's config", () => {
    const repo = copy("tampered");
    resetGitConfig(repo, CONFIG);
    expect(readFileSync(join(repo, ".git", "config"), "utf8")).toBe(CONFIG);
  });

  it("replaces a config folder", () => {
    const repo = copy("folder");
    rmSync(join(repo, ".git", "config"));
    mkdirSync(join(repo, ".git", "config", "inside"), { recursive: true });
    resetGitConfig(repo, CONFIG);
    expect(readFileSync(join(repo, ".git", "config"), "utf8")).toBe(CONFIG);
  });

  it("refuses a .git that isn't a folder in the copy", () => {
    const file = copy("file");
    rmSync(join(file, ".git"), { recursive: true });
    writeFileSync(join(file, ".git"), "gitdir: /elsewhere\n");
    expect(() => {
      resetGitConfig(file, CONFIG);
    }).toThrow("isn't a folder any more");

    const linked = copy("linked");
    const elsewhere = copy("elsewhere");
    rmSync(join(linked, ".git"), { recursive: true });
    symlinkSync(join(elsewhere, ".git"), join(linked, ".git"), "junction");
    expect(() => {
      resetGitConfig(linked, CONFIG);
    }).toThrow("isn't a folder any more");
    expect(readFileSync(join(elsewhere, ".git", "config"), "utf8")).toContain("fsmonitor");
  });

  it("removes a config that links outside the copy instead of writing through it, where the platform lets unprivileged users link files", () => {
    const repo = copy("link");
    const outside = join(scratch, "outside.txt");
    writeFileSync(outside, "keep me\n");
    rmSync(join(repo, ".git", "config"));
    try {
      symlinkSync(outside, join(repo, ".git", "config"), "file");
    } catch (error) {
      expect(process.platform).toBe("win32");
      expect(String(error)).toContain("EPERM");
      return;
    }
    resetGitConfig(repo, CONFIG);
    expect(readFileSync(outside, "utf8")).toBe("keep me\n");
    expect(readFileSync(join(repo, ".git", "config"), "utf8")).toBe(CONFIG);
  });
});
