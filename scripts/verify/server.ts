import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { supabaseCli, writeEnvLocal } from "../env-local/write";
import { parseEnvFile } from "../setup-secrets/plan";
import { sourceFingerprint } from "./fingerprint";
import { parseServerState, planServer, type ServerState } from "./server-plan";
import { VerifyError } from "./verify-error";

const supabaseServicesVerifyDoesNotUse = "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
const startupTimeoutMs = 90_000;

export function verifyDirectory(root: string): string {
  return join(root, "artifacts", "verify");
}

function say(message: string): void {
  process.stdout.write(`verify: ${message}\n`);
}

function statePath(root: string): string {
  return join(verifyDirectory(root), "server.json");
}

function readState(root: string): ServerState | undefined {
  return parseServerState(existsSync(statePath(root)) ? readFileSync(statePath(root), "utf8") : undefined);
}

function currentBuildId(root: string): string | undefined {
  const path = join(root, ".next", "BUILD_ID");
  return existsSync(path) ? readFileSync(path, "utf8").trim() || undefined : undefined;
}

function nextBin(root: string): string {
  try {
    return createRequire(join(root, "package.json")).resolve("next/dist/bin/next");
  } catch {
    throw new VerifyError(`can't find next in ${root}; run pnpm install there`);
  }
}

function logTail(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/).slice(-30).join("\n") : "";
}

function pidAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

async function healthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

function runLogged(
  root: string,
  logName: string,
  args: readonly string[],
  keepStdout = true,
): { ok: boolean; log: string } {
  const log = join(verifyDirectory(root), logName);
  const fd = openSync(log, "w");
  try {
    const stdout = keepStdout ? fd : "ignore";
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: ["ignore", stdout, fd], windowsHide: true });
    return { ok: result.status === 0, log };
  } finally {
    closeSync(fd);
  }
}

async function supabaseAnswers(root: string): Promise<boolean> {
  const envLocal = join(root, ".env.local");
  if (!existsSync(envLocal)) return false;
  const url = parseEnvFile(readFileSync(envLocal, "utf8")).get("NEXT_PUBLIC_SUPABASE_URL");
  return url !== undefined && url !== "" && (await answers(`${url}/rest/v1/`));
}

// The Supabase CLI asks Docker, which the build agent's commands can't reach (CLAUDE_CODE_SUBPROCESS_ENV_SCRUB runs
// them in bubblewrap). The app stack is already up there, so a database that answers over HTTP is enough.
async function ensureSupabase(root: string): Promise<void> {
  if (await supabaseAnswers(root)) return;
  const status =spawnSync(process.execPath, [supabaseCli, "status", "-o", "json"], { cwd: root, stdio: "ignore" });
  if (status.status === 0) return;
  say("starting local Supabase (first start can take a few minutes)");
  const started = runLogged(root, "supabase.log", [supabaseCli, "start", "-x", supabaseServicesVerifyDoesNotUse], false);
  if (!started.ok) {
    throw new VerifyError(`local Supabase didn't start; is Docker running? See ${started.log}`);
  }
}

function ensureEnvLocal(root: string): void {
  if (existsSync(join(root, ".env.local"))) return;
  writeEnvLocal(root);
  say("wrote .env.local from the local Supabase");
}

async function stopPid(pid: number, url: string): Promise<void> {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    for (const processOrGroup of [-pid, pid]) {
      try {
        process.kill(processOrGroup, "SIGTERM");
        break;
      } catch {
        continue;
      }
    }
  }
  for (let waited = 0; waited < 10_000 && (await answers(url)); waited += 250) await sleep(250);
}

async function startServer(root: string, port: number, fingerprint: string): Promise<string> {
  const url = `http://127.0.0.1:${String(port)}`;
  const next = nextBin(root);
  const buildStarted = Date.now();
  const build = runLogged(root, "build.log", [next, "build"]);
  if (!build.ok) throw new VerifyError(`next build failed (full log: ${build.log}):\n${logTail(build.log)}`);
  say(`built the app in ${String(Math.round((Date.now() - buildStarted) / 1000))}s`);

  const serverLog = join(verifyDirectory(root), "server.log");
  const fd = openSync(serverLog, "w");
  const child = spawn(process.execPath, [next, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  child.unref();
  if (child.pid === undefined) throw new VerifyError("next start didn't launch");
  const buildId = currentBuildId(root);
  if (buildId === undefined) throw new VerifyError("next build didn't write .next/BUILD_ID");

  const deadline = Date.now() + startupTimeoutMs;
  while (!(await healthy(url))) {
    if (child.exitCode !== null || Date.now() > deadline) {
      await stopPid(child.pid, url);
      throw new VerifyError(`the app didn't become healthy at ${url} (log: ${serverLog}):\n${logTail(serverLog)}`);
    }
    await sleep(500);
  }
  const state: ServerState = { pid: child.pid, port, url, fingerprint, buildId, startedAt: new Date().toISOString() };
  writeFileSync(statePath(root), `${JSON.stringify(state, null, 2)}\n`);
  return url;
}

export function verifyPort(): number {
  const port = Number(process.env.VERIFY_PORT ?? 3200);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new VerifyError("VERIFY_PORT must be a port number");
  return port;
}

export async function ensureServer(root: string, port: number): Promise<string> {
  mkdirSync(verifyDirectory(root), { recursive: true });
  await ensureSupabase(root);
  ensureEnvLocal(root);
  const state = readState(root);
  const fingerprint = sourceFingerprint(root);
  const plan = planServer({
    state,
    port,
    fingerprint,
    buildId: currentBuildId(root),
    pidAlive: pidAlive(state?.pid),
    portAnswers: await answers(`http://127.0.0.1:${String(port)}`),
  });
  if (plan.kind === "reuse") {
    say(`reusing the app at ${plan.url} (its build is current)`);
    return plan.url;
  }
  if (plan.kind === "port-taken") {
    throw new VerifyError(`port ${String(port)} is in use by a server verify didn't start; stop it or set VERIFY_PORT`);
  }
  if (plan.stopPid !== undefined && state) {
    say("the files or .next changed since verify built the app; rebuilding");
    await stopPid(plan.stopPid, state.url);
  }
  rmSync(statePath(root), { force: true });
  return startServer(root, port, fingerprint);
}

export async function stopServer(root: string): Promise<boolean> {
  const state = readState(root);
  rmSync(statePath(root), { force: true });
  if (!state || !pidAlive(state.pid) || !(await answers(state.url))) return false;
  await stopPid(state.pid, state.url);
  return true;
}
