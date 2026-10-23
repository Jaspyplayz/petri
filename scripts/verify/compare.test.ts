import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pairSteps, renderCompare, sideBySideHtml, writeSideBySide, type ComparedFlow } from "./compare";
import type { VerifyReport } from "./report";

function report(name: string, steps: readonly [string, string | null][], failures: readonly string[] = []): VerifyReport {
  return {
    name,
    description: "",
    baseUrl: "http://127.0.0.1:3200",
    startedAt: "2026-10-22T20:00:00.000Z",
    durationMs: 1_000,
    passed: failures.length === 0,
    failures,
    steps: steps.map(([label, screenshot], index) => ({ number: index + 1, label, screenshot, ms: 10, error: null })),
    console: [],
    pageErrors: [],
    network: [],
    a11y: [],
    vitals: [],
    brokenClassNames: [],
  };
}

function pngSize(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("pairSteps", () => {
  it("pairs each step after the change with the base's screenshot of the same step, if the base got that far", () => {
    const base = report("blob.hat", [["goto /", "step-01.png"]], ["step 2 (click blob-hat-button): no element"]);
    const pr = report("blob.hat", [
      ["goto /", "step-01.png"],
      ["click blob-hat-button", "step-02.png"],
      ["wait 100 ms", null],
    ]);
    expect(pairSteps(base, pr)).toEqual([
      { number: 1, label: "goto /", before: "step-01.png", after: "step-01.png" },
      { number: 2, label: "click blob-hat-button", before: null, after: "step-02.png" },
      { number: 3, label: "wait 100 ms", before: null, after: null },
    ]);
  });
});

describe("sideBySideHtml", () => {
  it("puts both screenshots in one page and escapes the labels", () => {
    const html = sideBySideHtml(
      'blob.poke step 2: click <blob> "poke"',
      { title: "Before: main (abc1234)", png: Buffer.from("before") },
      { title: "After: working tree", png: null },
    );
    expect(html).toContain("<h1>blob.poke step 2: click &#60;blob&#62; &#34;poke&#34;</h1>");
    expect(html).toContain(`src="data:image/png;base64,${Buffer.from("before").toString("base64")}"`);
    expect(html).toContain('<figcaption>After: working tree</figcaption><div class="missing">No screenshot for this step</div>');
  });
});

describe("writeSideBySide", { timeout: 30_000 }, () => {
  let browser: Browser;
  let dir: string;

  beforeAll(async () => {
    browser = await chromium.launch();
    dir = mkdtempSync(join(tmpdir(), "verify-compare-"));
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    for (const [side, files] of [
      ["base", ["step-01.png"]],
      ["pr", ["step-01.png", "step-02.png"]],
    ] as const) {
      mkdirSync(join(dir, side));
      for (const file of files) {
        await page.setContent(`<body style="margin:0;background:${side === "base" ? "#c00" : "#0a0"}"></body>`);
        await page.screenshot({ path: join(dir, side, file) });
      }
    }
    await page.close();
  });

  afterAll(async () => {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes one image per step with a screenshot on either side, two screenshots wide", async () => {
    const steps = pairSteps(
      report("blob.hat", [["goto /", "step-01.png"]]),
      report("blob.hat", [
        ["goto /", "step-01.png"],
        ["click blob-hat-button", "step-02.png"],
        ["wait 100 ms", null],
      ]),
    );
    const outDir = join(dir, "compare");
    mkdirSync(outDir);
    const written = await writeSideBySide(
      browser,
      "blob.hat",
      steps,
      { before: { title: "Before: main", dir: join(dir, "base") }, after: { title: "After: working tree", dir: join(dir, "pr") } },
      outDir,
    );
    expect(written).toEqual([
      { number: 1, path: join(outDir, "step-01.png") },
      { number: 2, path: join(outDir, "step-02.png") },
    ]);
    for (const { path } of written) {
      const size = pngSize(path);
      expect(size.width).toBe(1280 * 2 + 16 * 3);
      expect(size.height).toBeGreaterThan(720);
    }
  });
});

describe("renderCompare", () => {
  const passing = report("blob.poke", [["goto /", "step-01.png"]]);
  const flows: ComparedFlow[] = [
    { name: "blob.poke", base: passing, pr: passing, images: [{ number: 1, file: "compare/blob.poke/step-01.png" }] },
    {
      name: "blob.hat",
      base: report("blob.hat", [["goto /", "step-01.png"]], ['step 2 (click blob-hat-button): no element with data-testid="blob-hat-button" on the page']),
      pr: report("blob.hat", [["goto /", "step-01.png"]], ["console.error: boom"]),
      images: [],
    },
  ];

  it("summarises before and after per flow and lists what fails after the change", () => {
    expect(renderCompare("origin/main", "1234567890abcdef", flows)).toBe(
      [
        "# FAIL verify:compare origin/main (1234567) → working tree",
        "",
        "Before is the base build; after is this working tree. Both run the working tree's flows, so a flow that is new here is expected to fail on the base. Both use the same local Supabase and the base runs each flow first, so rows it writes can show up after.",
        "",
        "| Flow | Before | After | Side by side |",
        "|---|---|---|---|",
        "| blob.poke | pass | pass | [1](compare/blob.poke/step-01.png) |",
        "| blob.hat | **fail** (1) | **fail** (1) |  |",
        "",
        "## blob.hat fails after the change",
        "",
        "- console.error: boom",
        "",
      ].join("\n"),
    );
  });

  it("passes when every flow passes after the change, even if the base failed", () => {
    const newFlow: ComparedFlow = { name: "blob.hat", base: flows[1]?.base ?? passing, pr: passing, images: [] };
    expect(renderCompare("main", "abcdef0", [newFlow])).toMatch(/^# PASS verify:compare main \(abcdef0\)/);
  });
});
