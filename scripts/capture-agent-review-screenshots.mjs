import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="agent-review-queue"]', { timeout: 60000 });

  const queue = page.locator('[data-testid="agent-review-queue"]');

  await page.locator("text=Needs review").click();
  await queue.screenshot({ path: "artifacts/agent-review-collapsed.png" });

  await page.locator("text=Needs review").click();
  await queue.screenshot({ path: "artifacts/agent-review-expanded.png" });

  const card = page.locator('[data-testid="agent-review-card"]').first();
  await card.screenshot({ path: "artifacts/agent-review-card.png" });

  const panel = page.locator('[data-testid="agent-console-panel"]').first();
  await panel.screenshot({ path: "artifacts/agent-workbench-and-review.png" });

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
