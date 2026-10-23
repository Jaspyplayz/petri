import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devices, type Browser, type Page } from "@playwright/test";
import { a11yViolations, brokenClassNames, observeVitalsScript, readVitals } from "./browser-checks";
import { failuresOf, type A11yViolation, type ConsoleEntry, type NetworkProblem, type StepOutcome } from "./problems";
import { renderReport, type VerifyReport, type Vitals } from "./report";
import { describeStep, type VerifyRun, type VerifyStep } from "./steps";

export const screenshotOptions = { caret: "initial" } as const;

export type RunOptions = {
  readonly baseUrl: string;
  readonly outDir: string;
  readonly stepTimeoutMs?: number;
};

function randomTestIp(): string {
  return `198.18.${String(randomInt(0, 256))}.${String(randomInt(1, 255))}`;
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0] ?? message;
}

async function perform(page: Page, step: VerifyStep, baseUrl: string): Promise<void> {
  switch (step.action) {
    case "goto": {
      const url = new URL(step.path, baseUrl);
      if (url.origin !== new URL(baseUrl).origin) throw new Error(`goto ${step.path} leaves ${baseUrl}`);
      await page.goto(url.href);
      return;
    }
    case "click":
      await page.getByTestId(step.target).first().click();
      return;
    case "fill":
      await page.getByTestId(step.target).first().fill(step.value);
      return;
    case "press":
      await page.getByTestId(step.target).first().press(step.key);
      return;
    case "expectVisible":
      await page.getByTestId(step.target).first().waitFor({ state: "visible" });
      return;
    case "expectText":
      await page.getByTestId(step.target).filter({ hasText: step.text }).first().waitFor({ state: "visible" });
      return;
    case "screenshot":
      return;
    case "wait":
      await page.waitForTimeout(step.ms);
      return;
  }
}

async function explainFailure(page: Page, step: VerifyStep, error: unknown): Promise<string> {
  if (!("target" in step)) return firstLine(error);
  const matches = page.getByTestId(step.target);
  const count = await matches.count().catch(() => 0);
  if (count === 0) return `no element with data-testid="${step.target}" on the page`;
  if (step.action !== "expectText") return firstLine(error);
  const shown = await matches.first().textContent({ timeout: 1_000 }).catch(() => null);
  return `expected data-testid="${step.target}" to contain ${JSON.stringify(step.text)}; it shows ${JSON.stringify((shown ?? "").trim().slice(0, 200))}`;
}

async function scanned<T>(page: Page, scan: (page: Page) => Promise<T>): Promise<T> {
  try {
    return await scan(page);
  } catch {
    await page.waitForLoadState("load").catch(() => undefined);
    return scan(page);
  }
}

function remember(violations: Map<string, A11yViolation>, found: readonly A11yViolation[]): void {
  for (const violation of found) {
    const known = violations.get(violation.id);
    const seen = new Set(known?.nodes.map((node) => node.target));
    violations.set(
      violation.id,
      known === undefined ? violation : { ...known, nodes: [...known.nodes, ...violation.nodes.filter((node) => !seen.has(node.target))] },
    );
  }
}

export async function runVerification(browser: Browser, run: VerifyRun, options: RunOptions): Promise<VerifyReport> {
  mkdirSync(options.outDir, { recursive: true });
  const startedAt = new Date();
  const consoleEntries: ConsoleEntry[] = [];
  const pageErrors: string[] = [];
  const network: NetworkProblem[] = [];
  const steps: StepOutcome[] = [];
  const vitals = new Map<string, Vitals>();
  const violations = new Map<string, A11yViolation>();
  const brokenClasses = new Set<string>();

  const context = await browser.newContext({ ...devices["Desktop Chrome"], extraHTTPHeaders: { "x-forwarded-for": randomTestIp() } });
  context.setDefaultTimeout(options.stepTimeoutMs ?? 10_000);
  await context.addInitScript({ content: observeVitalsScript });
  context.on("console", (message) => consoleEntries.push({ type: message.type(), text: message.text(), url: message.location().url }));
  context.on("weberror", (webError) => pageErrors.push(webError.error().message));
  context.on("response", (response) => {
    if (response.status() >= 400) {
      network.push({ method: response.request().method(), url: response.url(), status: response.status(), failure: null });
    }
  });
  context.on("requestfailed", (request) => {
    network.push({ method: request.method(), url: request.url(), status: null, failure: request.failure()?.errorText ?? "unknown" });
  });

  try {
    const page = await context.newPage();
    for (const [index, step] of run.steps.entries()) {
      const number = index + 1;
      const stepStarted = Date.now();
      let error: string | null = null;
      try {
        await perform(page, step, options.baseUrl);
      } catch (thrown) {
        error = await explainFailure(page, step, thrown);
      }
      if (error === null && index === run.steps.length - 1) {
        await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
      }
      const screenshot = `step-${String(number).padStart(2, "0")}.png`;
      const saved = await page
        .screenshot({ path: join(options.outDir, screenshot), ...screenshotOptions })
        .then(() => true)
        .catch((thrown: unknown) => {
          error ??= `screenshot failed: ${firstLine(thrown)}`;
          return false;
        });
      const current = await scanned(page, readVitals).catch(() => null);
      if (current) vitals.set(current.url, current);
      try {
        for (const element of await scanned(page, brokenClassNames)) brokenClasses.add(element);
        remember(violations, await scanned(page, a11yViolations));
      } catch (thrown) {
        error ??= `page checks failed: ${firstLine(thrown)}`;
      }
      steps.push({ number, label: describeStep(step), screenshot: saved ? screenshot : null, ms: Date.now() - stepStarted, error });
      if (error !== null) break;
    }
  } finally {
    await context.close();
  }

  const observed = {
    steps,
    console: consoleEntries,
    pageErrors,
    network,
    a11y: [...violations.values()],
    brokenClassNames: [...brokenClasses],
  };
  const failures = failuresOf(observed);
  const report: VerifyReport = {
    name: run.name,
    description: run.description,
    baseUrl: options.baseUrl,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    passed: failures.length === 0,
    failures,
    ...observed,
    vitals: [...vitals.values()],
  };
  writeFileSync(join(options.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(options.outDir, "report.md"), renderReport(report));
  return report;
}
