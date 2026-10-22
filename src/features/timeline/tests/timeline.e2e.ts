import { expect, test } from "@/shared/testing/e2e-fixture";

test.describe("timeline", () => {
  test("shows seeded entries newest first with the human-free counter", async ({ page }) => {
    await page.goto("/timeline");
    await expect(page.getByTestId("timeline-heading")).toHaveText("Timeline");
    await expect(page.getByTestId("timeline-counter")).toHaveText(/^\d+ changes? shipped, 0 written by humans$/);

    const entries = page.getByTestId("timeline-entry");
    await expect(entries.first()).toBeVisible();
    const times = await entries.locator("time").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("datetime") ?? ""),
    );
    expect(times).toEqual([...times].sort().reverse());
  });

  test("reverts are clearly marked", async ({ page }) => {
    await page.goto("/timeline");
    const revert = page.locator('[data-testid="timeline-entry"][data-kind="revert"]').first();
    await expect(revert.getByTestId("timeline-revert-badge")).toHaveText("Reverted");
  });

  test("is reachable from the navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-timeline").click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(page.getByTestId("timeline-heading")).toBeVisible();
  });
});
