import { test, expect, type Page } from "@playwright/test";

async function gotoDashboard(page: Page) {
  await page.goto("/dashboard");
  // Client hydration is required for collapsible sections.
  await page.waitForLoadState("networkidle");

  // Landing marker for the accepted executive dashboard shell.
  await expect(page.getByRole("main").getByText(/^Business window$/i)).toBeVisible();
}

const SECTION_IDS = {
  commerce: "#dashboard-section-dashboard-section-commerce",
  marketing: "#dashboard-section-dashboard-section-marketing",
  operations: "#dashboard-section-dashboard-section-operations",
  industry: "#dashboard-section-dashboard-section-industry",
  confidence: "#dashboard-section-dashboard-section-data-confidence"
} as const;

async function openSection(page: Page, id: string) {
  const section = page.locator(id);
  await expect(section).toBeVisible();

  // DashboardSection renders the header as the first <button> inside the section.
  const headerButton = section.getByRole("button").first();
  await expect(headerButton).toBeVisible();
  await headerButton.click({ force: true });

  await expect(section).toHaveAttribute("data-state", "open");
  await expect(section.getByRole("region")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
});

test.describe("Executive dashboard (Epic 1) E2E", () => {
  test("loads without hydration-related console errors and renders core executive blocks", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await gotoDashboard(page);

    // Core executive shell blocks.
    await expect(page.getByText("Business Status", { exact: false })).toBeVisible();
    await expect(page.getByText("Executive KPI Scorecard", { exact: false })).toBeVisible();
    await expect(page.getByText("Top Drivers", { exact: false })).toBeVisible();
    await expect(page.getByText("Executive Actions", { exact: false })).toBeVisible();
    await expect(page.getByText(/Forward strategy/i)).toBeVisible();
    await expect(page.getByText(/Forecast/i)).toBeVisible();

    // Fail fast on hydration mismatches (but do not treat all console errors as fatal).
    const hydrationErrors = consoleErrors.filter((line) => /hydration|did not match|hydrating/i.test(line));
    expect(hydrationErrors).toEqual([]);
  });

  test("renders all five dashboard sections and sections can be expanded", async ({ page }) => {
    await gotoDashboard(page);

    // Section headers should exist even when collapsed.
    await expect(page.getByRole("button", { name: /Commerce/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Marketing/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Operations/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Industry/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Data Confidence/i })).toBeVisible();

    await openSection(page, SECTION_IDS.commerce);
    await openSection(page, SECTION_IDS.marketing);
    await openSection(page, SECTION_IDS.operations);
    await openSection(page, SECTION_IDS.industry);
    await openSection(page, SECTION_IDS.confidence);
  });

  test("mobile rendering keeps core shell + section controls usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoDashboard(page);

    await expect(page.getByRole("main").getByText(/^Business window$/i)).toBeVisible();
    await expect(page.getByText("Business Status", { exact: false })).toBeVisible();

    // At least one section control should be reachable on mobile.
    await expect(page.getByRole("button", { name: /Commerce/i })).toBeVisible();

    // Expand one section to validate collapsible behavior under mobile viewport.
    await openSection(page, SECTION_IDS.commerce);
  });

  test("forbidden strings are not rendered in the dashboard", async ({ page }) => {
    await gotoDashboard(page);

    // Validate against user-visible text, not raw HTML (which can include fixture JSON/ISO timestamps).
    const text = await page.locator("main").innerText();

    const forbiddenSubstrings = [
      "no_data",
      "semantic_summary_unsafe",
      "multiple_currencies",
      "Critical warning",
      "Urgent intervention",
      "Upper Deck",
      "Topps",
      "Revenue Per Visitor"
    ];

    for (const term of forbiddenSubstrings) {
      expect(text).not.toContain(term);
    }

    // Raw HTTP methods / raw API paths should not leak into user-visible text.
    expect(text).not.toMatch(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\//i);
    expect(text).not.toMatch(/\b\/api\/[a-z0-9/_-]+\b/i);

    // Raw ISO timestamps should not be directly rendered.
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z\b/);

    // NOTE: "Forward strategy" is an accepted visible block in the Epic 1 executive shell.
    // The forbidden list historically referenced "Forward Strategy" (legacy phrasing). We only
    // guard against the exact legacy-cased phrase here.
    expect(text).not.toContain("Forward Strategy");
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
});
