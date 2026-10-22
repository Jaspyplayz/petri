import { expect, test } from "@/shared/testing/e2e-fixture";

test.describe("blob", () => {
  test("poke counts pokes and survives a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("blob-pokes")).toHaveText("0");
    await page.getByTestId("blob-poke-button").click();
    await page.getByTestId("blob-creature").click();
    await expect(page.getByTestId("blob-pokes")).toHaveText("2");
    await page.reload();
    await expect(page.getByTestId("blob-pokes")).toHaveText("2");
  });

  test("feeding grows the blob", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("blob-size")).toHaveText("100%");
    await page.getByTestId("blob-feed-button").click();
    await expect(page.getByTestId("blob-size")).toHaveText("105%");
    await expect(page.getByTestId("blob-feeds")).toHaveText("1");
  });

  test("renaming validates and saves the name", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("blob-name-input").fill("   ");
    await page.getByTestId("blob-name-save").click();
    await expect(page.getByTestId("blob-name-error")).toBeVisible();
    await page.getByTestId("blob-name-input").fill("Gloop");
    await page.getByTestId("blob-name-save").click();
    await expect(page.getByTestId("blob-name")).toHaveText("Gloop");
    await expect(page.getByTestId("blob-name-error")).toHaveCount(0);
  });
});
