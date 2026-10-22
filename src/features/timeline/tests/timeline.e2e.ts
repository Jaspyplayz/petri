import { expect, test } from "@/shared/testing/e2e-fixture";

test("timeline: panel renders", async ({ page }) => {
  await page.goto("/timeline");
  await expect(page.getByTestId("timeline-panel")).toBeVisible();
  await expect(page.getByTestId("timeline-heading")).toHaveText("Timeline");
});
