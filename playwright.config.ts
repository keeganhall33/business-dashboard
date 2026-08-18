import { defineConfig, devices } from "@playwright/test";

// Playwright loads the config via a TS loader that can change __dirname.
// process.cwd() is the repository/package root in the supported test commands.
const packageRoot = process.cwd();

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    cwd: packageRoot,
    // Use the same standard Next.js production build/start model as the Vercel-oriented app.
    // Do not depend on the retired container-specific `output: standalone` artifact.
    command: "bash -lc 'set -euo pipefail; npm run build; npm run start -- -p 3100'",
    env: {
      ...process.env,
      E2E_TEST: "1",
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      PORT: "3100",
      DASHBOARD_ADMIN_TOKEN: "dev-dashboard-secret"
    },
    url: "http://localhost:3100/dashboard",
    reuseExistingServer: true,
    timeout: 180_000
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], browserName: "chromium" }
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"], browserName: "webkit" }
    }
  ]
});
