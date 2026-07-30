import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function artifactsDir() {
  const dir = path.join(process.cwd(), ".artifacts", "milestone-8");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function snap(pageName: string, page: any) {
  const file = path.join(artifactsDir(), `${pageName}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
});

test.describe("Milestone 8 vertical slice proof", () => {
  test("captures executive flow (Dashboard → Explain → Recommend → Data) with range switching", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Navigation visible (mobile grid may be used in CI viewport; check by link text).
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explain" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Recommend" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Data & Integrations" })).toBeVisible();

    // Dashboard landing marker.
    await expect(page.getByText(/^Business window$/i)).toBeVisible();
    await snap("01-dashboard-30d", page);

    // Range behavior: switch to 7D.
    await page.getByTestId("range-preset-7d").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\brange=7d\b/i);
    await snap("02-dashboard-7d", page);

    // Explain.
    await page.getByRole("link", { name: "Explain" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/explain/);
    await expect(page.getByText("Summary → Explanation")).toBeVisible();
    await snap("03-explain", page);

    // Evidence section visible.
    await expect(page.getByText("Telemetry metadata")).toBeVisible();

    // Recommend.
    await page.getByRole("link", { name: "Recommend" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/recommend/);
    await expect(page.getByText(/Recommendations \(read-only\)/i)).toBeVisible();
    await snap("04-recommend", page);

    // Data & Integrations.
    await page.getByRole("link", { name: "Data & Integrations" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/data/);
    await expect(page.getByText(/Live telemetry health/i)).toBeVisible();
    await snap("05-data-integrations", page);

    // Act + Learn minimal views.
    await page.getByRole("link", { name: "Act" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Act \(no execution\)/i)).toBeVisible();
    await snap("06-act", page);

    await page.getByRole("link", { name: "Learn" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1", { hasText: "Learn" })).toBeVisible();
    await snap("07-learn", page);

    // Low-confidence/empty-ish state: jump to a far-future custom window.
    // (Should not crash; should surface missing data limitations.)
    await page.goto("/recommend?range=custom&start=2099-01-01&end=2099-01-07");
    await page.waitForLoadState("networkidle");
    await snap("08-recommend-empty-state", page);
  });
});
