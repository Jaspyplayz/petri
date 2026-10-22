import { randomInt } from "node:crypto";
import { test as base, expect } from "@playwright/test";

type BrowserProblems = {
  readonly problems: string[];
};

function randomTestIp(): string {
  return `198.18.${String(randomInt(0, 256))}.${String(randomInt(1, 255))}`;
}

export const test = base.extend<BrowserProblems>({
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-forwarded-for": randomTestIp() });
  },
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          problems.push(`console.error: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        problems.push(`pageerror: ${error.message}`);
      });
      await use(problems);
      expect(problems, "browser console errors or uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
