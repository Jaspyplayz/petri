import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import type { VerifyReport } from "./report";
import { screenshotOptions } from "./runner";

export type ComparedStep = {
  readonly number: number;
  readonly label: string;
  readonly before: string | null;
  readonly after: string | null;
};

export type ComparedFlow = {
  readonly name: string;
  readonly base: VerifyReport;
  readonly pr: VerifyReport;
  readonly images: readonly { readonly number: number; readonly file: string }[];
};

export type Side = { readonly title: string; readonly dir: string };

const shotWidth = 1280;
const shotHeight = 720;
const gap = 16;

export function pairSteps(base: VerifyReport, pr: VerifyReport): ComparedStep[] {
  return pr.steps.map((step) => ({
    number: step.number,
    label: step.label,
    before: base.steps.find((candidate) => candidate.number === step.number)?.screenshot ?? null,
    after: step.screenshot,
  }));
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${String(character.charCodeAt(0))};`);
}

function column(title: string, png: Buffer | null): string {
  const body =
    png === null
      ? `<div class="missing">No screenshot for this step</div>`
      : `<img alt="${escapeHtml(title)}" src="data:image/png;base64,${png.toString("base64")}">`;
  return `<figure><figcaption>${escapeHtml(title)}</figcaption>${body}</figure>`;
}

export function sideBySideHtml(
  step: string,
  before: { readonly title: string; readonly png: Buffer | null },
  after: { readonly title: string; readonly png: Buffer | null },
): string {
  const px = (value: number): string => `${String(value)}px`;
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Before and after</title><style>',
    `body{margin:0;padding:${px(gap)};background:#fff;color:#111;font:16px system-ui,sans-serif}`,
    `h1{margin:0 0 12px;font-size:18px}main{display:flex;gap:${px(gap)};align-items:flex-start}`,
    `figure{margin:0;width:${px(shotWidth)}}figcaption{font-weight:600;margin-bottom:6px}`,
    `img{display:block;width:${px(shotWidth)};outline:1px solid #ccc}`,
    `.missing{display:flex;align-items:center;justify-content:center;height:${px(shotHeight)};outline:1px dashed #999;color:#555}`,
    `</style></head><body><h1>${escapeHtml(step)}</h1><main>${column(before.title, before.png)}${column(after.title, after.png)}</main></body></html>`,
  ].join("");
}

function screenshotIn(dir: string, file: string | null): Buffer | null {
  return file === null ? null : readFileSync(join(dir, file));
}

export async function writeSideBySide(
  browser: Browser,
  flow: string,
  steps: readonly ComparedStep[],
  sides: { readonly before: Side; readonly after: Side },
  outDir: string,
): Promise<{ number: number; path: string }[]> {
  const context = await browser.newContext({ viewport: { width: shotWidth * 2 + gap * 3, height: shotHeight }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const written: { number: number; path: string }[] = [];
    for (const step of steps.filter((candidate) => candidate.before !== null || candidate.after !== null)) {
      const html = sideBySideHtml(
        `${flow} step ${String(step.number)}: ${step.label}`,
        { title: sides.before.title, png: screenshotIn(sides.before.dir, step.before) },
        { title: sides.after.title, png: screenshotIn(sides.after.dir, step.after) },
      );
      await page.setContent(html, { waitUntil: "load" });
      const path = join(outDir, `step-${String(step.number).padStart(2, "0")}.png`);
      await page.screenshot({ path, fullPage: true, ...screenshotOptions });
      written.push({ number: step.number, path });
    }
    return written;
  } finally {
    await context.close();
  }
}

function result(report: VerifyReport): string {
  return report.passed ? "pass" : `**fail** (${String(report.failures.length)})`;
}

export function renderCompare(baseRef: string, sha: string, flows: readonly ComparedFlow[]): string {
  const failing = flows.filter((flow) => !flow.pr.passed).length;
  return [
    `# ${failing === 0 ? "PASS" : "FAIL"} verify:compare ${baseRef} (${sha.slice(0, 7)}) → working tree`,
    "",
    "Before is the base build; after is this working tree. Both run the working tree's flows, so a flow that is new here is expected to fail on the base. Both use the same local Supabase and the base runs each flow first, so rows it writes can show up after.",
    "",
    "| Flow | Before | After | Side by side |",
    "|---|---|---|---|",
    ...flows.map(
      (flow) =>
        `| ${flow.name} | ${result(flow.base)} | ${result(flow.pr)} | ${flow.images.map((image) => `[${String(image.number)}](${image.file})`).join(" ")} |`,
    ),
    "",
    ...flows.flatMap((flow) =>
      flow.pr.passed ? [] : [`## ${flow.name} fails after the change`, "", ...flow.pr.failures.map((failure) => `- ${failure}`), ""],
    ),
  ].join("\n");
}
