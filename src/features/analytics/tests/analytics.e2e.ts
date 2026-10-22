import { expect, test } from "@/shared/testing/e2e-fixture";

test.describe("analytics", () => {
  test("a page view is recorded when the home page opens", async ({ page }) => {
    const recorded = page.waitForResponse(
      (response) => response.url().endsWith("/api/events") && response.request().method() === "POST",
    );
    await page.goto("/");
    const response = await recorded;
    expect(response.status()).toBe(202);
  });

  test("invalid events are rejected without being stored", async ({ request }) => {
    const response = await request.post("/api/events", {
      data: { featureId: "blob", action: "view", path: "https://evil.example" },
    });
    expect(response.status()).toBe(400);
  });

  test("cross-site events are refused", async ({ request }) => {
    const response = await request.post("/api/events", {
      data: { featureId: "blob", action: "view", path: "/" },
      headers: { origin: "https://evil.example" },
    });
    expect(response.status()).toBe(403);
  });
});
