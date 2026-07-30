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
    // This app uses `output: 'standalone'`. Start the standalone server without hardcoding
    // the checkout directory name.
    command:
      "bash -lc 'set -euo pipefail; " +
      "pnpm exec next build; " +
      "servers=$(find .next/standalone -maxdepth 4 -type f -name server.js -print); " +
      "count=$(printf \"%s\\n\" $servers | sed \"/^$/d\" | wc -l | tr -d \" \" ); " +
      "if [ \"$count\" -eq 0 ]; then echo \"No standalone server.js found under .next/standalone\" >&2; exit 1; fi; " +
      "if [ \"$count\" -ne 1 ]; then echo \"Multiple standalone server.js files found under .next/standalone:\" >&2; printf \" - %s\\n\" $servers >&2; exit 1; fi; " +
      "server=$(printf \"%s\\n\" $servers | head -n 1); " +
      "dir=$(cd \"$(dirname \"$server\")\" && pwd); " +
      "repo=$(pwd); " +
      "ln -sfn \"$repo/public\" \"$dir/public\"; " +
      "mkdir -p \"$dir/.next\"; " +
      "ln -sfn \"$repo/.next/static\" \"$dir/.next/static\"; " +
      "cd \"$dir\"; " +
      "node server.js'",
    env: {
      ...process.env,
      E2E_TEST: "1",
      NEXT_DISABLE_TURBOPACK: "1",
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
