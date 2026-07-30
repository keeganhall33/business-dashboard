import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
});

test.describe("Milestone 11 Action Center E2E", () => {
  test("Act page renders Action Center and can prepare → ready → approve without execution", async ({ page, request }) => {
    // Create a recommendation-backed action via API (auth is disabled in this E2E server).
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const recId = `e2e:m11:rec:${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const create = await request.post("/api/actions", {
      data: {
        actor: "ceo",
        window,
        recommendation: {
          id: recId,
          title: `E2E M11 Action (${recId})`,
          category: "email",
          approval_level: "L1_RECOMMENDATION",
          status: "recommended",
          confidence: "possible",
          expected_outcome: "Harness",
          reason: "Harness",
          affected_channels: ["email"],
          affected_products: ["store"],
          affected_audiences: ["all"],
          priority_score: { overallScore: 55 },
          estimated_incremental_revenue: { usd: 1000 },
          estimated_cost: { usd: 0 },
          estimated_effort: { hours: 1 },
          risk: "medium",
          approval_requirements: {},
          measurement_window: window,
          data_missing: [],
          limitations: []
        },
        evidence_snapshot: { window, fingerprint: `e2e:${recId}` }
      },
      headers: { "content-type": "application/json", "x-idempotency-key": `e2e:${recId}:create` }
    });
    if (!create.ok()) {
      const body = await create.text();
      throw new Error(`Create failed: ${create.status()} ${body.slice(0, 400)}`);
    }
    const createJson = (await create.json()) as { ok: boolean; action?: { id: string } };
    expect(createJson.ok).toBeTruthy();
    const actionId = createJson.action?.id;
    expect(actionId).toBeTruthy();

    await page.goto("/act");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Action Center", { exact: false })).toBeVisible();

    // Action list is SSR; retry once if the create landed slightly after initial render.
    const actionLink = page.getByRole("link", { name: `E2E M11 Action (${recId})` });
    await expect(actionLink).toBeVisible();

    const getCard = () => page.locator("div.rounded-2xl", { has: page.getByRole("link", { name: `E2E M11 Action (${recId})` }) }).first();

    // Prepare
    await getCard().getByRole("button", { name: "Prepare" }).click();
    await page.waitForLoadState("networkidle");
    await expect(getCard().getByText("draft_prepared", { exact: true })).toBeVisible();

    // Ready
    await getCard().getByRole("button", { name: "Ready" }).click();
    await page.waitForLoadState("networkidle");
    await expect(getCard().getByText("awaiting_approval", { exact: true })).toBeVisible();

    // Approve (expect alert)
    page.once("dialog", (d) => d.accept());
    await getCard().getByRole("button", { name: "Approve" }).click();
    await page.waitForLoadState("networkidle");
    await expect(getCard().getByText("approved", { exact: true })).toBeVisible();

    // Details page should load.
    await page.getByRole("link", { name: `E2E M11 Action (${recId})` }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/act\/actions\//);
  });
});
