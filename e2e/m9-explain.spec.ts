import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function outDir() {
  const dir = path.join(process.cwd(), ".artifacts", "milestone-9-causal-explanations");
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

test.describe("Milestone 9 explanation proof", () => {
  test("captures explanation for revenue increase/decrease/insufficient evidence + mobile", async ({ page }) => {
    const scenarios = [
      { name: "m9-revenue-increase.png", url: "/explain?range=custom&start=2026-05-02&end=2026-05-08" },
      { name: "m9-revenue-decrease.png", url: "/explain?range=custom&start=2026-06-06&end=2026-06-12" },
      { name: "m9-insufficient-evidence.png", url: "/explain?range=custom&start=2099-01-01&end=2099-01-07" }
    ];

    for (const s of scenarios) {
      await page.goto(s.url);
      await page.waitForLoadState("networkidle");
      await assertLive(page);
      await expect(page.getByText(/Causal explanation engine/i)).toBeVisible();
      await expect(page.getByText(/What happened/i)).toBeVisible();
      await expect(page.getByText(/Why it happened/i)).toBeVisible();
      await snap(page, s.name);
    }

    // Mobile explanation view.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(scenarios[0].url);
    await page.waitForLoadState("networkidle");
    await assertLive(page);
    await snap(page, "m9-mobile-explain.png");
  });
});

