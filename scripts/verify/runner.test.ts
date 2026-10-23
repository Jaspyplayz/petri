import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runVerification, screenshotOptions } from "./runner";
import type { VerifyStep } from "./steps";

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title><link rel="icon" href="data:,"></head><body><main><h1>Fixture</h1>${body}</main></body></html>`;
}

const counter = `<p data-testid="count">0</p>
<button type="button" data-testid="add" onclick="const count = document.querySelector('[data-testid=count]'); count.textContent = String(Number(count.textContent) + 1)">Add</button>
<label>Name <input data-testid="name"></label>`;

const pages: Record<string, string> = {
  "/": page(counter),
  "/console-error": page(`${counter}<script>console.error("boom from the fixture")</script>`),
  "/page-error": page(`${counter}<script>throw new Error("kaboom from the fixture")</script>`),
  "/missing-image": page(`${counter}<img src="/missing.png" alt="A picture that isn't there">`),
  "/unnamed-button": page(`${counter}<button type="button" data-testid="mystery"></button>`),
  "/undefined-class": page(`${counter}<div class="card undefined" data-testid="card">Card</div>`),
};

let server: Server;
let browser: Browser;
let baseUrl: string;
const outDirs: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    const html = pages[request.url ?? ""];
    response.writeHead(html === undefined ? 404 : 200, { "content-type": "text/html" }).end(html ?? "not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

async function verify(path: string, steps: readonly VerifyStep[] = []) {
  const outDir = mkdtempSync(join(tmpdir(), "verify-runner-"));
  outDirs.push(outDir);
  const report = await runVerification(
    browser,
    { name: "fixture", description: "A fixture page.", steps: [{ action: "goto", path }, ...steps] },
    { baseUrl, outDir, stepTimeoutMs: 1_500 },
  );
  return { report, outDir };
}

describe("runVerification", { timeout: 30_000 }, () => {
  it("passes a clean page and writes a screenshot per step and both reports", async () => {
    const { report, outDir } = await verify("/", [
      { action: "expectVisible", target: "count" },
      { action: "click", target: "add" },
      { action: "expectText", target: "count", text: "1" },
      { action: "fill", target: "name", value: "Gloop" },
      { action: "press", target: "name", key: "Enter" },
      { action: "screenshot", name: "after" },
    ]);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.steps.map((step) => step.screenshot)).toEqual(["step-01.png", "step-02.png", "step-03.png", "step-04.png", "step-05.png", "step-06.png", "step-07.png"]);
    for (const step of report.steps) {
      expect(readFileSync(join(outDir, step.screenshot ?? "")).subarray(1, 4).toString()).toBe("PNG");
    }
    expect(JSON.parse(readFileSync(join(outDir, "report.json"), "utf8"))).toEqual(report);
    expect(readFileSync(join(outDir, "report.md"), "utf8")).toMatch(/^# PASS fixture\n/);
    expect(report.vitals.map((vitals) => vitals.url)).toEqual(["/"]);
    expect(report.vitals[0]?.lcpMs).toBeGreaterThan(0);
    expect(report.vitals[0]?.cls).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ["a console.error", "/console-error", "console.error: boom from the fixture"],
    ["an uncaught page error", "/page-error", "pageerror: kaboom from the fixture"],
    ["a request that returns 404", "/missing-image", "HTTP 404 GET {base}/missing.png"],
    ["a class name containing undefined", "/undefined-class", 'class name contains "undefined" or "null": div[data-testid="card"][class="card undefined"]'],
  ])("fails on %s", async (_label, path, expected) => {
    const { report } = await verify(path);
    expect(report.passed).toBe(false);
    expect(report.failures).toContain(expected.replace("{base}", baseUrl));
  });

  it("fails on a serious accessibility violation", async () => {
    const { report } = await verify("/unnamed-button", [{ action: "expectVisible", target: "mystery" }]);
    expect(report.passed).toBe(false);
    expect(report.a11y.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([
      ["button-name", ['button[data-testid="mystery"]']],
    ]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatch(
      /^a11y critical: button-name \(Buttons must have discernible text\) on button\[data-testid="mystery"\]\. Element does not have inner text that is visible to screen readers /,
    );
  });

  it("stops at a failed assertion and says what the page shows", async () => {
    const { report, outDir } = await verify("/", [
      { action: "expectText", target: "count", text: "5" },
      { action: "click", target: "add" },
    ]);
    expect(report.failures).toEqual(['step 2 (expectText count "5"): expected data-testid="count" to contain "5"; it shows "0"']);
    expect(report.steps).toHaveLength(2);
    expect(existsSync(join(outDir, "step-02.png"))).toBe(true);
    expect(readdirSync(outDir)).not.toContain("step-03.png");
  });

  it("names a data-testid that isn't on the page", async () => {
    const { report } = await verify("/", [{ action: "click", target: "nope" }]);
    expect(report.failures).toEqual(['step 2 (click nope): no element with data-testid="nope" on the page']);
  });

  it("takes every screenshot with the caret left alone, so React doesn't see a style it didn't render", () => {
    expect(screenshotOptions.caret).toBe("initial");
    const sources = readdirSync(import.meta.dirname)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(import.meta.dirname, file), "utf8"));
    const calls = sources.flatMap((source) => [...source.matchAll(/\.screenshot\(([^)]*\)?[^)]*)\)/g)].map((match) => match[1] ?? ""));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain("...screenshotOptions");
  });
});
