import { expect, test } from "@/shared/testing/e2e-fixture";

test.describe("feedback writes", () => {
  test("posting from the form adds the item to the board", async ({ page }) => {
    const text = `Give the blob a scarf ${String(Date.now())}`;
    await page.goto("/feedback?sort=new");
    await expect(page.getByTestId("feedback-submit")).toBeDisabled();
    await page.getByTestId("feedback-body-input").fill(text);
    await expect(page.getByTestId("feedback-char-count")).toHaveText(`${String(280 - text.length)} characters left`);
    await page.getByTestId("feedback-category-bug").check();
    await page.getByTestId("feedback-submit").click();

    await expect(page.getByTestId("feedback-form-message")).toHaveAttribute("data-tone", "success");
    await expect(page.getByTestId("feedback-body-input")).toHaveValue("");
    const item = page.getByTestId("feedback-item").filter({ hasText: text });
    await expect(item).toBeVisible();
    await expect(item.getByTestId("feedback-item-status")).toHaveText("New");
  });

  test("voting raises the count once per visitor", async ({ page }) => {
    await page.goto("/feedback?sort=new");
    const item = page.getByTestId("feedback-item").first();
    const id = await item.getAttribute("data-feedback-id");
    const target = page.locator(`[data-feedback-id="${String(id)}"]`);
    const before = Number(await target.getByTestId("feedback-vote-count").innerText());

    await target.getByTestId("feedback-vote-button").click();
    await expect(target.getByTestId("feedback-vote-button")).toHaveAttribute("aria-pressed", "true");
    await expect(target.getByTestId("feedback-vote-count")).toHaveText(String(before + 1));

    await page.reload();
    await target.getByTestId("feedback-vote-button").click();
    await expect(target.getByTestId("feedback-vote-button")).toHaveAttribute("aria-pressed", "true");
    await expect(target.getByTestId("feedback-vote-count")).toHaveText(String(before + 1));
  });

  test("the API validates input and caps length", async ({ request }) => {
    const tooLong = await request.post("/api/feedback", { data: { body: "x".repeat(281), category: "idea" } });
    expect(tooLong.status()).toBe(400);
    const badCategory = await request.post("/api/feedback", { data: { body: "hi", category: "praise" } });
    expect(badCategory.status()).toBe(400);
    const huge = await request.post("/api/feedback", { data: { body: "x".repeat(10_000), category: "idea" } });
    expect(huge.status()).toBe(413);
    const unknownVote = await request.post("/api/feedback/00000000-0000-4000-8000-00000000ffff/vote");
    expect(unknownVote.status()).toBe(404);
    const badId = await request.post("/api/feedback/not-a-uuid/vote");
    expect(badId.status()).toBe(404);
  });

  test("a repeat vote is idempotent", async ({ request }) => {
    const id = "00000000-0000-4000-8000-000000000003";
    const first = await request.post(`/api/feedback/${id}/vote`);
    expect(first.status()).toBe(201);
    const again = await request.post(`/api/feedback/${id}/vote`);
    expect(again.status()).toBe(200);
    expect(await again.json()).toEqual({ alreadyVoted: true });
  });

  test("posting is rate limited to 5 per hour per IP", async ({ request }) => {
    for (let i = 1; i <= 5; i += 1) {
      const ok = await request.post("/api/feedback", { data: { body: `rate limit probe ${String(i)}`, category: "idea" } });
      expect(ok.status()).toBe(201);
    }
    const limited = await request.post("/api/feedback", { data: { body: "one too many", category: "idea" } });
    expect(limited.status()).toBe(429);
    expect(limited.headers()["retry-after"]).toBe("3600");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });
});
