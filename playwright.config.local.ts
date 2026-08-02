import { defineConfig, devices } from "@playwright/test";

// Local-only config to run E2E against an already-running dev server.
// Usage:
//   pnpm exec playwright test --config playwright.config.local.ts
// Start server first (from business-dashboard):
//   pnpm dev -p 3100
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
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
