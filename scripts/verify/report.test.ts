import { describe, expect, it } from "vitest";
import type { StepOutcome } from "./problems";
import { renderReport, renderSummary, runFolderName, type VerifyReport } from "./report";

const gotoStep: StepOutcome = { number: 1, label: "goto /", screenshot: "step-01.png", ms: 412, error: null };

const passing: VerifyReport = {
  name: "blob.poke",
  description: "Poking the blob makes it wobble and counts the poke.",
  baseUrl: "http://127.0.0.1:3200",
  startedAt: "2026-10-22T20:00:00.000Z",
  durationMs: 3_210,
  passed: true,
  failures: [],
  steps: [gotoStep, { number: 2, label: "click blob-poke-button", screenshot: "step-02.png", ms: 85, error: null }],
  console: [{ type: "log", text: "ready", url: "http://127.0.0.1:3200/" }],
  pageErrors: [],
  network: [],
  a11y: [],
  vitals: [{ url: "/", lcpMs: 640, cls: 0.002 }],
  brokenClassNames: [],
};

const failing: VerifyReport = {
  ...passing,
  passed: false,
  failures: ['step 2 (expectText blob-pokes "1"): it shows "0" | not "1"', "console.error: boom"],
  steps: [gotoStep, { number: 2, label: 'expectText blob-pokes "1"', screenshot: null, ms: 10_000, error: "it shows\n\"0\"" }],
  console: [
    { type: "error", text: "boom", url: "http://127.0.0.1:3200/" },
    { type: "warning", text: "careful", url: "http://127.0.0.1:3200/" },
  ],
  network: [
    { method: "GET", url: "http://127.0.0.1:3200/missing.png", status: 404, failure: null },
    { method: "GET", url: "http://127.0.0.1:9/x", status: null, failure: "net::ERR_CONNECTION_REFUSED" },
  ],
  a11y: [
    {
      id: "button-name",
      impact: "critical",
      help: "Buttons must have discernible text",
      nodes: [
        { target: "#a", summary: "Element does not have inner text that is visible to screen readers" },
        { target: "button | x", summary: null },
      ],
    },
  ],
  vitals: [{ url: "/feedback?sort=new", lcpMs: null, cls: 0 }],
};

describe("runFolderName", () => {
  it("is the UTC timestamp with no characters Windows forbids", () => {
    expect(runFolderName(new Date("2026-10-22T20:01:02.345Z"))).toBe("2026-10-22T20-01-02-345Z");
  });
});

describe("renderReport", () => {
  it("summarises a passing run", () => {
    expect(renderReport(passing)).toBe(
      [
        "# PASS blob.poke",
        "",
        "Poking the blob makes it wobble and counts the poke.",
        "",
        "- Base URL: http://127.0.0.1:3200",
        "- Started: 2026-10-22T20:00:00.000Z · 2 steps · 3.2 s",
        "",
        "## Failures",
        "",
        "None.",
        "",
        "## Steps",
        "",
        "| # | Step | Result | Screenshot |",
        "|---|---|---|---|",
        "| 1 | goto / | ok (412 ms) | [step-01.png](step-01.png) |",
        "| 2 | click blob-poke-button | ok (85 ms) | [step-02.png](step-02.png) |",
        "",
        "## Console",
        "",
        "1 messages, 0 errors or warnings.",
        "",
        "## Network",
        "",
        "No responses ≥ 400 and no failed requests.",
        "",
        "## Accessibility (axe)",
        "",
        "No violations.",
        "",
        "## Web Vitals",
        "",
        "| Page | LCP | CLS |",
        "|---|---|---|",
        "| / | 640 ms | 0.002 |",
        "",
      ].join("\n"),
    );
  });

  it("lists every failure and keeps table cells on one line", () => {
    const markdown = renderReport(failing);
    expect(markdown).toMatch(/^# FAIL blob\.poke\n/);
    expect(markdown).toContain('- step 2 (expectText blob-pokes "1"): it shows "0" \\| not "1"\n- console.error: boom\n');
    expect(markdown).toContain('| 2 | expectText blob-pokes "1" | **failed:** it shows "0" (10000 ms) | none |');
    expect(markdown).toContain("2 messages, 2 errors or warnings.\n\n- error: boom\n- warning: careful\n\n## Network");
    expect(markdown).toContain("- GET http://127.0.0.1:3200/missing.png: HTTP 404\n- GET http://127.0.0.1:9/x: net::ERR_CONNECTION_REFUSED");
    expect(markdown).toContain(
      [
        "| Rule | Impact | Element | Why |",
        "|---|---|---|---|",
        "| button-name | critical | `#a` | Element does not have inner text that is visible to screen readers |",
        "| button-name | critical | `button \\| x` | Buttons must have discernible text |",
      ].join("\n"),
    );
    expect(markdown).toContain("| /feedback?sort=new | n/a | 0 |");
  });
});

describe("renderSummary", () => {
  it("counts passing flows and lists the failures of the others", () => {
    expect(
      renderSummary([
        { folder: "blob.poke", report: passing },
        { folder: "blob.feed", report: { ...failing, name: "blob.feed" } },
      ]),
    ).toBe(
      [
        "# FAIL verify:all (1/2 flows passed)",
        "",
        "| Flow | Result | Steps | Time | Report |",
        "|---|---|---|---|---|",
        "| blob.poke | pass | 2 | 3.2 s | [report.md](blob.poke/report.md) |",
        "| blob.feed | **fail** (2) | 2 | 3.2 s | [report.md](blob.feed/report.md) |",
        "",
        "## blob.feed",
        "",
        '- step 2 (expectText blob-pokes "1"): it shows "0" \\| not "1"',
        "- console.error: boom",
        "",
      ].join("\n"),
    );
  });

  it("passes when every flow passed", () => {
    expect(renderSummary([{ folder: "blob.poke", report: passing }])).toMatch(/^# PASS verify:all \(1\/1 flows passed\)\n/);
  });
});
