import { expect, test } from "@/shared/testing/e2e-fixture";

test("feedback: panel renders", async ({ page }) => {
  await page.goto("/feedback");
  await expect(page.getByTestId("feedback-panel")).toBeVisible();
  await expect(page.getByTestId("feedback-heading")).toHaveText("Feedback");
});
