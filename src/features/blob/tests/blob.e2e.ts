import { expect, test } from "@/shared/testing/e2e-fixture";

test("blob: panel renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("blob-panel")).toBeVisible();
  await expect(page.getByTestId("blob-heading")).toHaveText("Blob");
});
