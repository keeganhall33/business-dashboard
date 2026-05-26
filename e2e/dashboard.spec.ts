import { test, expect, type Page } from "@playwright/test";

async function gotoDashboard(page: Page) {
  await page.goto("/dashboard");
  // Client hydration is required for the collapsible sections + modals to work.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible();
}

async function ensurePipelineSectionOpen(page: Page) {
  // Use the built-in jump link so we don't rely on scroll position.
  await page.getByRole("link", { name: "Jump to pipeline" }).click({ force: true });

  // Avoid ambiguous <section> matching: DashboardSection renders a stable id derived from storageKey.
  const pipelineSection = page.locator("#dashboard-section-pipeline");
  await expect(pipelineSection).toBeVisible();
  await pipelineSection.scrollIntoViewIfNeeded();

  const pipelineToggle = pipelineSection.getByRole("button").first();
  await expect(pipelineToggle).toBeVisible();

  if ((await pipelineToggle.getAttribute("aria-expanded")) !== "true") {
    await pipelineToggle.click({ force: true });
  }

  // Sanity: the panel contents should render when expanded.
  await expect(pipelineSection.getByText(/opportunity radar/i)).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
});

test.describe("Executive dashboard E2E", () => {
  test("automation panel run button (proof-enforcement) works without hydration errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await gotoDashboard(page);

    // Open the automation insight drawer.
    const cardTitle = page.getByText("Proof enforcement reminders", { exact: true }).first();
    await expect(cardTitle).toBeVisible();
    await cardTitle.scrollIntoViewIfNeeded();

    const automationCard = cardTitle.locator(
      "xpath=ancestor-or-self::div[contains(concat(' ', normalize-space(@class), ' '), ' rounded-2xl ')][1]"
    );

    // Insight cards have an "Explain" button which opens the drawer.
    await automationCard.getByRole("button", { name: "Explain" }).click({ force: true });

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();

    const runResponse = page.waitForResponse((res) =>
      res.url().includes("/api/automation/run-job") && res.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: /Restart automation job/i }).click({ force: true });
    const response = await runResponse;
    expect(response.ok()).toBeTruthy();

    // Hydration mismatches often surface as console errors; fail fast if we see them.
    const hydrationErrors = consoleErrors.filter((line) => /hydration|did not match|hydrating/i.test(line));
    expect(hydrationErrors).toEqual([]);
  });

  test("collector drawer + evidence drawer + command palette", async ({ page }) => {
    await gotoDashboard(page);

    // High-signal command-center nodes should render.
    await expect(page.getByText(/survival runway/i)).toBeVisible();
    await expect(page.getByText(/cash on hand/i).first()).toBeVisible();

    await ensurePipelineSectionOpen(page);

    // Collector cards are buttons now; open the first one.
    const collectorButton = page.getByRole("button", { name: /^Open collector / }).first();
    await collectorButton.scrollIntoViewIfNeeded();
    await collectorButton.click();

    // Drawer should appear.
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    // Evidence drawer is nested (open from the evidence chips).
    const openEvidence = drawer.getByRole("button", { name: "Open" }).first();
    if (await openEvidence.isVisible()) {
      await openEvidence.click();
      const evidenceDrawer = page.getByRole("dialog", { name: /evidence/i });
      await expect(evidenceDrawer).toBeVisible();
      await evidenceDrawer.getByRole("button", { name: "Close" }).click();
    }

    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();

    // Command palette: Cmd+K.
    await page.keyboard.press("Meta+K");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    await palette.getByPlaceholder("Search actions…").fill("refresh");
    await expect(palette.getByRole("button", { name: /Refresh dashboard/i })).toBeVisible();
    await palette.getByRole("button", { name: "Close" }).click();

    await test.info().attach("collector-drawer.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });

  test("kpis API smoke (E2E harness)", async ({ request }) => {
    const listRes = await request.get("/api/kpis");
    expect(listRes.ok()).toBeTruthy();
    const listJson = await listRes.json();
    expect(listJson.ok).toBeTruthy();
    expect(Array.isArray(listJson.items)).toBeTruthy();

    const upsertRes = await request.post("/api/kpis", {
      data: {
        kpiKey: "kpi-e2e-custom",
        agentKey: "avery",
        kpiName: "E2E KPI",
        description: "created in playwright",
        targetValue: 123,
        unit: "USD",
        frequency: "weekly",
        priority: "low"
      }
    });
    expect(upsertRes.ok()).toBeTruthy();
    const upsertJson = await upsertRes.json();
    expect(upsertJson.ok).toBeTruthy();
    expect(upsertJson.kpi?.kpiKey).toBe("kpi-e2e-custom");
  });

  test("war-room + idea board approval task linking", async ({ page }) => {
    await gotoDashboard(page);

    await ensurePipelineSectionOpen(page);

    // War room state should render from E2E fixture.
    await expect(page.getByText("War Room", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();

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
    await gotoDashboard(page);

    const survivalStrip = page.locator("section").filter({ hasText: /survival runway/i }).first();
    await expect(survivalStrip).toBeVisible();

    // Open the inline form and submit.
    await survivalStrip.getByRole("button", { name: /^edit$/i }).click({ force: true });

    await expect(page.getByLabel("Cash on hand")).toBeVisible();
    await page.getByLabel("Cash on hand").fill("15000");
    await page.getByLabel("Monthly burn").fill("5000");

    const saveResponse = page.waitForResponse((res) =>
      res.url().includes("/api/finance/snapshot") && res.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Save" }).click();
    await saveResponse;

    // Form should close after successful save.
    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();

    await test.info().attach("finance-inline-form.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });

  test("manual sale entry save (sheet)", async ({ page }) => {
    await gotoDashboard(page);

    // Open the sheet from the Sales panel floating action button.
    await page.getByRole("button", { name: "Add manual sale" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Add manual sale" }).click({ force: true });
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
    await gotoDashboard(page);

    // Modal rendering from TaskCard "View work".
    const commandCenter = page.locator("#dashboard-section-command");
    await expect(commandCenter).toBeVisible();

    // The command center contains multiple "View work" buttons (action-queue row + task cards).
    // The task-card one opens the ViewWorkModal.
    const viewWork = commandCenter.getByRole("button", { name: "View work" }).last();
    await viewWork.scrollIntoViewIfNeeded();
    await expect(viewWork).toBeVisible();
    // Avoid flake from sticky headers intercepting pointer events.
    await viewWork.dispatchEvent("click");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
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

    await ensurePipelineSectionOpen(page);
    await expect(page.getByText("Idea board", { exact: false })).toBeVisible();
    await expect(page.getByText("War Room", { exact: true }).first()).toBeVisible();

    await test.info().attach("dashboard-mobile.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });
});
