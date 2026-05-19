import { test, expect } from "@playwright/test";

test.describe("Executive dashboard E2E", () => {
  test("war-room + idea board approval task linking", async ({ page }) => {
    await page.goto("/dashboard");

    // Pipeline section is collapsed by default.
    await page.getByRole("button", { name: /Pipeline & Partnerships/i }).click();

    // War room state should render from E2E fixture.
    await expect(page.getByText("War Room", { exact: true })).toBeVisible();
    await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conversion drop" })).toBeVisible();

    // Idea board should show an approval-gated idea.
    await expect(page.getByText("Idea board", { exact: false })).toBeVisible();
    const queueButton = page.getByRole("button", { name: "Queue CEO review task" });
    await expect(queueButton).toBeVisible();

    const responsePromise = page.waitForResponse((res) =>
      res.url().includes("/api/automation/idea-board/sync-review-tasks") && res.request().method() === "POST"
    );
    await queueButton.click();
    await responsePromise;

    // UI should surface the linked task id after successful POST.
    await expect(page.getByText(/Task task-e2e-review-1/)).toBeVisible();

    await test.info().attach("dashboard-desktop.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });

  test("manual finance entry save (inline form)", async ({ page }) => {
    await page.goto("/dashboard");

    // Open the inline form and submit.
    await page.getByRole("button", { name: "Edit" }).click();

    await page.getByLabel("Cash on hand").fill("15000");
    await page.getByLabel("Monthly burn").fill("5000");

    const saveResponse = page.waitForResponse((res) =>
      res.url().includes("/api/finance/snapshot") && res.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Save" }).click();
    await saveResponse;

    // Form should close after successful save.
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    await test.info().attach("finance-inline-form.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });

  test("manual sale entry save (sheet)", async ({ page }) => {
    await page.goto("/dashboard");

    // Open the sheet from the Sales panel floating action button.
    await page.getByRole("button", { name: "Add manual sale" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Manual sale entry")).toBeVisible();

    await dialog.getByLabel("Revenue delta (USD)").fill("1200");
    await dialog.getByLabel("Orders").fill("2");

    const revenueReading = page.waitForResponse((res) => {
      if (!res.url().includes("/api/metrics/readings")) return false;
      if (res.request().method() !== "POST") return false;
      const data = res.request().postData();
      return Boolean(data && data.includes("manual_sales_revenue"));
    });

    const ordersReading = page.waitForResponse((res) => {
      if (!res.url().includes("/api/metrics/readings")) return false;
      if (res.request().method() !== "POST") return false;
      const data = res.request().postData();
      return Boolean(data && data.includes("manual_sales_orders"));
    });

    await dialog.getByRole("button", { name: "Save manual entry" }).click();
    const res1 = await revenueReading;
    const res2 = await ordersReading;
    expect(res1.ok()).toBeTruthy();
    expect(res2.ok()).toBeTruthy();

    // Sheet should close after successful save.
    await expect(dialog).toBeHidden();

    await test.info().attach("sales-manual-entry.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });

  test("approvals + modal rendering + mobile layout", async ({ page }) => {
    await page.goto("/dashboard");

    // Modal rendering from TaskCard "View work".
    const viewWork = page.getByRole("button", { name: "View work" }).first();
    await viewWork.scrollIntoViewIfNeeded();
    await viewWork.evaluate((el) => (el as HTMLButtonElement).click());
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    // Approvals: click approve and ensure the request succeeds.
    const approveResponse = page.waitForResponse((res) => res.url().includes("/api/tasks/") && res.url().endsWith("/approve"));
    await page.getByRole("button", { name: "Approve" }).first().click();
    const res = await approveResponse;
    expect(res.ok()).toBeTruthy();

    // Responsive layout: mobile viewport should keep key panels visible.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("button", { name: /Pipeline & Partnerships/i }).click();
    await expect(page.getByText("Idea board", { exact: false })).toBeVisible();
    await expect(page.getByText("War Room", { exact: true })).toBeVisible();

    await test.info().attach("dashboard-mobile.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });
});
