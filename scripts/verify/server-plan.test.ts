import { describe, expect, it } from "vitest";
import { parseServerState, planServer, type ServerState } from "./server-plan";

const state: ServerState = {
  pid: 4242,
  port: 3200,
  url: "http://127.0.0.1:3200",
  fingerprint: "abc",
  startedAt: "2026-10-22T20:00:00.000Z",
};

const facts = { state, port: 3200, fingerprint: "abc", pidAlive: true, portAnswers: true };

describe("planServer", () => {
  it("reuses our server when it answers and was built from the same files", () => {
    expect(planServer(facts)).toEqual({ kind: "reuse", url: "http://127.0.0.1:3200" });
  });

  it("stops and rebuilds our server when the files changed", () => {
    expect(planServer({ ...facts, fingerprint: "changed" })).toEqual({ kind: "start", stopPid: 4242 });
  });

  it("starts fresh without killing anything when our process is gone", () => {
    expect(planServer({ ...facts, pidAlive: false, portAnswers: false })).toEqual({ kind: "start", stopPid: undefined });
  });

  it("doesn't kill a live pid that no longer answers on the port, since the OS may have reused it", () => {
    expect(planServer({ ...facts, portAnswers: false })).toEqual({ kind: "start", stopPid: undefined });
  });

  it("refuses a port that something else answers on", () => {
    expect(planServer({ ...facts, state: undefined })).toEqual({ kind: "port-taken" });
    expect(planServer({ ...facts, pidAlive: false })).toEqual({ kind: "port-taken" });
    expect(planServer({ ...facts, port: 3300 })).toEqual({ kind: "port-taken" });
  });

  it("starts when there is no state and the port is free", () => {
    expect(planServer({ ...facts, state: undefined, pidAlive: false, portAnswers: false })).toEqual({
      kind: "start",
      stopPid: undefined,
    });
  });
});

describe("parseServerState", () => {
  it("reads a state file it wrote", () => {
    expect(parseServerState(JSON.stringify(state))).toEqual(state);
  });

  it.each([undefined, "", "not json", "{}", JSON.stringify({ ...state, pid: -1 }), JSON.stringify({ ...state, url: "nope" })])(
    "treats %j as no state",
    (text) => {
      expect(parseServerState(text)).toBeUndefined();
    },
  );
});
