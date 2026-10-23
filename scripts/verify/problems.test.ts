import { describe, expect, it } from "vitest";
import { failuresOf, type Observations } from "./problems";

const clean: Observations = {
  steps: [{ number: 1, label: "goto /", screenshot: "step-01.png", ms: 300, error: null }],
  console: [
    { type: "log", text: "hello", url: "http://127.0.0.1:3200/" },
    { type: "warning", text: "careful", url: "http://127.0.0.1:3200/" },
  ],
  pageErrors: [],
  network: [{ method: "GET", url: "http://127.0.0.1:3200/_next/x.js", status: null, failure: "net::ERR_ABORTED" }],
  a11y: [
    { id: "region", impact: "moderate", help: "All page content should be contained by landmarks", nodes: [{ target: "p", summary: null }] },
    { id: "heading-order", impact: null, help: "Heading levels should only increase by one", nodes: [{ target: "h3", summary: null }] },
  ],
  brokenClassNames: [],
};

describe("failuresOf", () => {
  it("passes logs, warnings, aborted navigations and minor a11y findings", () => {
    expect(failuresOf(clean)).toEqual([]);
  });

  it("fails on every kind of problem, step failures first", () => {
    expect(
      failuresOf({
        steps: [...clean.steps, { number: 2, label: "click x", screenshot: "step-02.png", ms: 10_000, error: "no element" }],
        console: [...clean.console, { type: "error", text: "boom", url: "http://127.0.0.1:3200/" }],
        pageErrors: ["kaboom"],
        network: [
          ...clean.network,
          { method: "GET", url: "http://127.0.0.1:3200/missing.png", status: 404, failure: null },
          { method: "POST", url: "http://127.0.0.1:3200/api/events", status: 503, failure: null },
          { method: "GET", url: "http://127.0.0.1:9/x", status: null, failure: "net::ERR_CONNECTION_REFUSED" },
        ],
        a11y: [
          ...clean.a11y,
          {
            id: "button-name",
            impact: "critical",
            help: "Buttons must have discernible text",
            nodes: ["#a", "#b", "#c", "#d"].map((target) => ({ target, summary: null })),
          },
          {
            id: "color-contrast",
            impact: "serious",
            help: "Elements must meet contrast",
            nodes: [{ target: "p", summary: "Element has insufficient color contrast of 3.59 (foreground color: #f6f3e7, background color: #2f8f6b)" }],
          },
        ],
        brokenClassNames: ['div[data-testid="blob-body"]'],
      }),
    ).toEqual([
      "step 2 (click x): no element",
      "console.error: boom",
      "pageerror: kaboom",
      "HTTP 404 GET http://127.0.0.1:3200/missing.png",
      "HTTP 503 POST http://127.0.0.1:3200/api/events",
      "request failed (net::ERR_CONNECTION_REFUSED) GET http://127.0.0.1:9/x",
      "a11y critical: button-name (Buttons must have discernible text) on #a, #b, #c and 1 more",
      "a11y serious: color-contrast (Elements must meet contrast) on p. Element has insufficient color contrast of 3.59 (foreground color: #f6f3e7, background color: #2f8f6b)",
      'class name contains "undefined" or "null": div[data-testid="blob-body"]',
    ]);
  });
});
