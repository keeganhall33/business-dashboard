import { chromium, webkit } from "@playwright/test";

const url = process.env.DASHBOARD_URL;
if (!url) throw new Error("Missing DASHBOARD_URL");

const runs = [
  { name: "desktop-chromium", engine: "chromium", viewport: { width: 1440, height: 900 } },
  { name: "mobile-chromium", engine: "chromium", viewport: { width: 390, height: 844 } },
  { name: "mobile-webkit", engine: "webkit", viewport: { width: 390, height: 844 } }
];

const forbidden = [
  "SUPABASE_",
  "WOOCOMMERCE_",
  "service_role",
  "task_queue",
  "PGRST",
  "scripts/run-",
  "process.env",
  "DASHBOARD_ADMIN_TOKEN"
];

async function runOne({ name, engine, viewport }) {
  const browserType = engine === "webkit" ? webkit : chromium;
  const browser = await browserType.launch();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  const consoleErrors = [];
  const requestFailures = [];

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  page.on("requestfailed", (req) => {
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? "unknown" });
  });

  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const status = res?.status() ?? null;

  await page.waitForTimeout(1500);
  const html = await page.content();
  const forbiddenMatches = forbidden.filter((s) => html.includes(s));

  const screenshotPath = `/tmp/staging_browser_${name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await context.close();
  await browser.close();

  return {
    name,
    status,
    consoleErrors: consoleErrors.slice(0, 20),
    requestFailures: requestFailures.slice(0, 20),
    forbiddenMatches,
    screenshotPath
  };
}

const report = { url, generatedAt: new Date().toISOString(), results: [] };
for (const r of runs) report.results.push(await runOne(r));
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
