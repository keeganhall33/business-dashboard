import { defineConfig, devices } from "@playwright/test";
// Playwright loads the config via a TS loader that can change __dirname (compiled temp dir).
// In `pnpm -C business-dashboard test:e2e`, process.cwd() is the package root.
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
    // NOTE: Turbopack chunk-load errors can flake E2E in CI; force webpack dev server.
    // Run from this package root so Next resolves workspace-local deps correctly under pnpm.
    cwd: packageRoot,
    // Run a prod server to avoid dev hot-reloader / Turbopack instability during E2E.
    // This app is configured with `output: 'standalone'`, so use the standalone server entry.
    command:
      "pnpm exec next build && (cd .next/standalone/business-dashboard && ln -sfn ../../../public public && mkdir -p .next && ln -sfn ../../../static .next/static) && (cd .next/standalone/business-dashboard && node server.js)",
    env: {
      ...process.env,
      E2E_TEST: "1",
      NEXT_DISABLE_TURBOPACK: "1",
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      PORT: "3100"
    },
    url: "http://localhost:3100/dashboard",
    reuseExistingServer: true,
    timeout: 180_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
