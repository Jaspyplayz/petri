import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuardrailsConfig } from "./config";
import { repoRoot } from "./context";
import { lockfileReason } from "./lockfile";

const { guardrailPackages } = loadGuardrailsConfig(repoRoot);
const lockfile = readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8").replaceAll("\r\n", "\n");

function replaceOnce(text: string, from: string | RegExp, to: string): string {
  const next = text.replace(from, to);
  if (next === text) throw new Error(`fixture pattern not found: ${String(from)}`);
  return next;
}

function insertAfterLast(text: string, marker: string, insertion: string): string {
  const at = text.lastIndexOf(marker);
  if (at === -1) throw new Error(`fixture marker not found: ${marker}`);
  return text.slice(0, at + marker.length) + insertion + text.slice(at + marker.length);
}

const addedDependency = insertAfterLast(
  replaceOnce(
    lockfile,
    "    dependencies:\n",
    "    dependencies:\n      left-pad:\n        specifier: 1.3.0\n        version: 1.3.0\n",
  ),
  "\npackages:\n\n",
  "  left-pad@1.3.0:\n    resolution: {integrity: sha512-XI5MPzVNApjAyhQzphX8BkmKsKUxD4LdyK24iZeQEmg}\n\n",
);

describe("lockfileReason", () => {
  it("allows an unchanged lockfile and an ordinary registry dependency", () => {
    expect(lockfileReason(lockfile, lockfile, guardrailPackages)).toBeUndefined();
    expect(lockfileReason(lockfile, addedDependency, guardrailPackages)).toBeUndefined();
  });

  it("blocks removing the lockfile", () => {
    expect(lockfileReason(lockfile, undefined, guardrailPackages)).toMatch(/added or removed/);
  });

  it("blocks pnpm overrides and settings changes", () => {
    const overridden = replaceOnce(lockfile, /\nimporters:\n\n  \.:\n    dependencies:/, "\noverrides:\n  eslint: npm:noop@1.0.0\n\nimporters:\n\n  .:\n    dependencies:");
    expect(lockfileReason(lockfile, overridden, guardrailPackages)).toMatch(/"overrides"/);
    const resettled = replaceOnce(lockfile, "autoInstallPeers: true", "autoInstallPeers: false");
    expect(lockfileReason(lockfile, resettled, guardrailPackages)).toMatch(/"settings"/);
  });

  it("blocks changing the document that pins pnpm", () => {
    const otherPnpm = replaceOnce(lockfile, "specifier: 12.15.0\n        version: 12.15.0", "specifier: 12.0.0\n        version: 12.0.0");
    expect(lockfileReason(lockfile, otherPnpm, guardrailPackages)).toMatch(/pins pnpm/);
  });

  it("blocks non-registry resolutions", () => {
    const tarball = replaceOnce(
      addedDependency,
      "resolution: {integrity: sha512-XI5MPzVNApjAyhQzphX8BkmKsKUxD4LdyK24iZeQEmg}",
      "resolution: {tarball: https://example.com/left-pad.tgz}",
    );
    expect(lockfileReason(lockfile, tarball, guardrailPackages)).toMatch(/npm registry/);
  });

  it("blocks re-resolving a guardrail toolchain package", () => {
    const otherEslint = replaceOnce(lockfile, /(\n {6}eslint:\n {8}specifier: )([^\n]+)\n {8}version: [^\n]+/, "$1$2\n        version: 9.0.0");
    expect(lockfileReason(lockfile, otherEslint, guardrailPackages)).toMatch(/guardrail toolchain package eslint/);
  });
});
