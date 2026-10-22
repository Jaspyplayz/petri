import { expect, test } from "@/shared/testing/e2e-fixture";

test("analytics: panel renders", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByTestId("analytics-panel")).toBeVisible();
  await expect(page.getByTestId("analytics-heading")).toHaveText("Analytics");
});
