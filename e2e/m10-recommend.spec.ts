import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function outDir() {
  const dir = path.join(process.cwd(), ".artifacts", "milestone-10-recommendations");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function snap(page: Page, name: string) {
  const file = path.join(outDir(), name);
  await page.screenshot({ path: file, fullPage: true });
}

async function assertLive(page: Page) {
  const mode = page.getByTestId("data-mode-indicator");
  await expect(mode).toBeVisible();
  await expect(mode).not.toHaveText(/seed data/i);
}

test.beforeEach(async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
});

test.describe("Milestone 10 recommendation proof", () => {
  test("captures opportunity + recommendation centers + drafts + mobile", async ({ page }) => {
    await page.goto("/recommend?range=custom&start=2026-05-02&end=2026-05-08");
    await page.waitForLoadState("networkidle");
    await assertLive(page);

    await expect(page.getByText(/Opportunity Center/i)).toBeVisible();
    await expect(page.getByText(/Recommendation Center/i)).toBeVisible();
    await snap(page, "m10-opportunity-center.png");

    await page.getByText(/Top recommendations/i).scrollIntoViewIfNeeded();
    await snap(page, "m10-top-recommendations.png");

    // Risk/leak and insufficient evidence.
    await page.goto("/recommend?range=custom&start=2099-01-01&end=2099-01-07");
    await page.waitForLoadState("networkidle");
    await assertLive(page);
    await snap(page, "m10-insufficient-evidence.png");

    // Mobile view
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/recommend?range=custom&start=2026-05-02&end=2026-05-08");
    await page.waitForLoadState("networkidle");
    await assertLive(page);
    await snap(page, "m10-mobile-recommend.png");
  });
});

