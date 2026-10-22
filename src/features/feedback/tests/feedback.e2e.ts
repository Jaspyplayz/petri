import { expect, test } from "@/shared/testing/e2e-fixture";

test.describe("feedback board", () => {
  test("lists feedback sorted by votes, then by newest", async ({ page }) => {
    await page.goto("/feedback");
    await expect(page.getByTestId("feedback-list")).toHaveAttribute("data-sort", "top");
    const counts = await page.getByTestId("feedback-vote-count").allInnerTexts();
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.map(Number)).toEqual([...counts.map(Number)].sort((a, b) => b - a));

    await page.getByTestId("feedback-sort-new").click();
    await expect(page).toHaveURL(/sort=new/);
    await expect(page.getByTestId("feedback-list")).toHaveAttribute("data-sort", "new");
    await expect(page.getByTestId("feedback-sort-new")).toHaveAttribute("aria-current", "page");
  });

  test("shows status badges", async ({ page }) => {
    await page.goto("/feedback");
    await expect(page.getByTestId("feedback-item-status").first()).toBeVisible();
  });
});
