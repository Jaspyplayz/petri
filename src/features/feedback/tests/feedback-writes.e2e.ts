import { randomInt } from "node:crypto";
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

  test("voting raises the count once per visitor", async ({ page, request }) => {
    const posted = await request.post("/api/feedback", { data: { body: `Vote probe ${String(Date.now())}`, category: "idea" } });
    expect(posted.status()).toBe(201);
    const { id } = (await posted.json()) as { id: string };
    await page.goto("/feedback?sort=new");
    const target = page.locator(`[data-feedback-id="${id}"]`);
    const before = Number(await target.getByTestId("feedback-vote-count").innerText());

    await target.getByTestId("feedback-vote-button").click();
    await expect(target.getByTestId("feedback-vote-button")).toHaveAttribute("aria-pressed", "true");
    await expect(target.getByTestId("feedback-vote-count")).toHaveText(String(before + 1));

    await page.reload();
    await target.getByTestId("feedback-vote-button").click();
    await expect(target.getByTestId("feedback-vote-button")).toHaveAttribute("aria-pressed", "true");
    await expect(target.getByTestId("feedback-vote-note")).toHaveText("Already counted");
    await expect(target.getByTestId("feedback-vote-count")).toHaveText(String(before + 1));
  });

  test("each browser on one connection votes, up to 5 per item", async ({ request }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    const statuses: number[] = [];
    for (let browser = 1; browser <= 6; browser += 1) {
      const vote = await request.post(`/api/feedback/${id}/vote`, {
        data: {},
        headers: { cookie: `petri_voter=${crypto.randomUUID()}` },
      });
      statuses.push(vote.status());
      if (browser === 6) expect(await vote.json()).toEqual({ error: "vote_limit" });
    }
    expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    expect(statuses.at(-1)).toBe(409);
  });

  test("reporting asks first, then counts once per network", async ({ page, request }) => {
    const posted = await request.post("/api/feedback", { data: { body: `Report probe ${String(Date.now())}`, category: "idea" } });
    expect(posted.status()).toBe(201);
    const { id } = (await posted.json()) as { id: string };
    await page.goto("/feedback?sort=new");
    const target = page.locator(`[data-feedback-id="${id}"]`);
    const button = target.getByTestId("feedback-report-button");

    await button.dblclick();
    await expect(target.getByTestId("feedback-report-note")).toHaveCount(0);
    await page.reload();

    await button.click();
    await expect(button).toHaveText("Confirm report");
    await target.getByTestId("feedback-report-cancel").click();
    await expect(button).toHaveText("Report");
    await expect(button).toBeFocused();

    await button.click();
    await expect(button).toHaveText("Confirm report");
    await button.click();
    await expect(target.getByTestId("feedback-report-note")).toHaveText("Reported. Thanks.");
    await expect(target.getByTestId("feedback-report-note")).toBeFocused();

    await page.reload();
    await button.click();
    await expect(button).toHaveText("Confirm report");
    await button.click();
    await expect(target.getByTestId("feedback-report-note")).toHaveText("Already reported");
    await expect(target).toBeVisible();
  });

  test("reports from 3 networks hide an item", async ({ page, request }) => {
    const text = `Hide probe ${String(Date.now())}`;
    const posted = await request.post("/api/feedback", { data: { body: text, category: "idea" } });
    expect(posted.status()).toBe(201);
    const { id } = (await posted.json()) as { id: string };
    const reportFrom = async (network: number) => {
      const report = await request.post(`/api/feedback/${id}/report`, {
        data: {},
        headers: { "x-forwarded-for": `198.19.${String(network)}.${String(randomInt(1, 255))}` },
      });
      return report.status();
    };
    expect([await reportFrom(1), await reportFrom(2)]).toEqual([201, 201]);
    await page.goto("/feedback?sort=new");
    await expect(page.locator(`[data-feedback-id="${id}"]`)).toBeVisible();

    expect(await reportFrom(3)).toBe(201);
    await page.reload();
    await expect(page.getByTestId("feedback-list")).toBeVisible();
    await expect(page.locator(`[data-feedback-id="${id}"]`)).toHaveCount(0);
    await expect(page.getByTestId("feedback-list")).not.toContainText(text);
  });

  test("an IPv6 /48 counts as one network for reports", async ({ page, request }) => {
    const text = `IPv6 hide probe ${String(Date.now())}`;
    const posted = await request.post("/api/feedback", { data: { body: text, category: "idea" } });
    expect(posted.status()).toBe(201);
    const { id } = (await posted.json()) as { id: string };
    const base = randomInt(0, 0x10000);
    const reportFrom = async (network48: number, subnet64: number) => {
      const prefix = `2001:db8:${((base + network48) % 0x10000).toString(16)}:${subnet64.toString(16)}`;
      const report = await request.post(`/api/feedback/${id}/report`, {
        data: {},
        headers: { "x-forwarded-for": `${prefix}::${randomInt(1, 0x10000).toString(16)}` },
      });
      return report.status();
    };
    expect([await reportFrom(0, 1), await reportFrom(0, 2), await reportFrom(0, 0xff00)]).toEqual([201, 200, 200]);
    await page.goto("/feedback?sort=new");
    await expect(page.locator(`[data-feedback-id="${id}"]`)).toBeVisible();

    expect([await reportFrom(1, 1), await reportFrom(2, 1)]).toEqual([201, 201]);
    await page.reload();
    await expect(page.getByTestId("feedback-list")).toBeVisible();
    await expect(page.locator(`[data-feedback-id="${id}"]`)).toHaveCount(0);
    await expect(page.getByTestId("feedback-list")).not.toContainText(text);
  });

  test("reports refuse unknown items and cross-site requests", async ({ request }) => {
    const unknown = await request.post("/api/feedback/00000000-0000-4000-8000-00000000ffff/report", { data: {} });
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not_found" });
    const badId = await request.post("/api/feedback/not-a-uuid/report", { data: {} });
    expect(badId.status()).toBe(404);
    const crossSite = await request.post("/api/feedback/00000000-0000-4000-8000-000000000003/report", {
      data: {},
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(crossSite.status()).toBe(403);
    const noBody = await request.post("/api/feedback/00000000-0000-4000-8000-000000000003/report");
    expect(noBody.status()).toBe(415);
  });

  test("the API validates input and caps length", async ({ request }) => {
    const tooLong = await request.post("/api/feedback", { data: { body: "x".repeat(281), category: "idea" } });
    expect(tooLong.status()).toBe(400);
    const badCategory = await request.post("/api/feedback", { data: { body: "hi", category: "praise" } });
    expect(badCategory.status()).toBe(400);
    const huge = await request.post("/api/feedback", { data: { body: "x".repeat(10_000), category: "idea" } });
    expect(huge.status()).toBe(413);
    const unknownVote = await request.post("/api/feedback/00000000-0000-4000-8000-00000000ffff/vote", { data: {} });
    expect(unknownVote.status()).toBe(404);
    const badId = await request.post("/api/feedback/not-a-uuid/vote", { data: {} });
    expect(badId.status()).toBe(404);
  });

  test("cross-site and non-JSON writes are refused", async ({ request }) => {
    const crossSite = await request.post("/api/feedback/00000000-0000-4000-8000-000000000003/vote", {
      data: {},
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(crossSite.status()).toBe(403);
    const plainText = await request.post("/api/feedback", {
      data: JSON.stringify({ body: "csrf attempt", category: "idea" }),
      headers: { "content-type": "text/plain" },
    });
    expect(plainText.status()).toBe(415);
    const noBodyVote = await request.post("/api/feedback/00000000-0000-4000-8000-000000000003/vote");
    expect(noBodyVote.status()).toBe(415);
  });

  test("a repeat vote is idempotent", async ({ request }) => {
    const id = "00000000-0000-4000-8000-000000000003";
    const first = await request.post(`/api/feedback/${id}/vote`, { data: {} });
    expect(first.status()).toBe(201);
    const again = await request.post(`/api/feedback/${id}/vote`, { data: {} });
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
