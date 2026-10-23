import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import { z } from "zod";
import type { A11yViolation } from "./problems";
import type { Vitals } from "./report";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

export const observeVitalsScript = `(() => {
  const vitals = { lcp: null, cls: 0 };
  Object.defineProperty(window, "__verifyVitals", { value: vitals });
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) vitals.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
})();`;

const readVitalsScript = `(() => {
  const vitals = window.__verifyVitals;
  return vitals
    ? { url: location.pathname + location.search, lcpMs: vitals.lcp === null ? null : Math.round(vitals.lcp), cls: Math.round(vitals.cls * 1000) / 1000 }
    : null;
})()`;

const brokenClassNamesScript = `[...document.querySelectorAll("[class]")]
  .filter((element) => /(^|\\s)(undefined|null)(\\s|$)/.test(element.getAttribute("class") ?? ""))
  .map((element) => element.tagName.toLowerCase() + (element.dataset.testid ? '[data-testid="' + element.dataset.testid + '"]' : "") + '[class="' + element.getAttribute("class") + '"]')
  .slice(0, 20)`;

const runAxeScript = `axe.run(document, { resultTypes: ["violations"] }).then((result) =>
  result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(" "),
      summary: (node.failureSummary ?? "").split("\\n").map((line) => line.trim()).filter((line) => line && !/^Fix (any|all) of the following:$/.test(line)).join(" ") || null,
    })),
  })),
)`;

const vitalsSchema = z.object({ url: z.string(), lcpMs: z.number().nullable(), cls: z.number() }).nullable();
const brokenClassNamesSchema = z.array(z.string());
const violationsSchema = z.array(
  z.object({
    id: z.string(),
    impact: z.string().nullable(),
    help: z.string(),
    nodes: z.array(z.object({ target: z.string(), summary: z.string().nullable() })),
  }),
);

export async function readVitals(page: Page): Promise<Vitals | null> {
  return vitalsSchema.parse(await page.evaluate(readVitalsScript));
}

export async function brokenClassNames(page: Page): Promise<string[]> {
  return brokenClassNamesSchema.parse(await page.evaluate(brokenClassNamesScript));
}

export async function a11yViolations(page: Page): Promise<A11yViolation[]> {
  await page.evaluate(axeSource);
  return violationsSchema.parse(await page.evaluate(runAxeScript));
}
