import { expect, test } from "./e2e-fixture";

const consoleError = "deliberate console error from the fixture self-test";
const pageError = "deliberate page error from the fixture self-test";

test.describe("e2e fixture", () => {
  test("records console errors from the page", async ({ page, problems }) => {
    await page.evaluate(`console.error(${JSON.stringify(consoleError)})`);
    await expect.poll(() => problems.join("\n")).toContain(`console.error: ${consoleError}`);
    problems.splice(0);
  });

  test("records uncaught page errors", async ({ page, problems }) => {
    await page.evaluate(`setTimeout(() => { throw new Error(${JSON.stringify(pageError)}); }, 0)`);
    await expect.poll(() => problems.join("\n")).toContain(`pageerror: ${pageError}`);
    problems.splice(0);
  });

  test("fails the test when the page recorded a problem", async ({ page, problems }) => {
    test.fail();
    await page.evaluate(`console.error(${JSON.stringify(consoleError)})`);
    await expect.poll(() => problems.length).toBe(1);
  });
});
