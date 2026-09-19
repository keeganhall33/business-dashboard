import assert from "node:assert/strict";
import test from "node:test";

import { getDashboardOverview } from "@/lib/api/dashboard";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("dashboard overview ignores caller-controlled origins before attaching server credentials", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalPublicUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalAdminToken = process.env.DASHBOARD_ADMIN_TOKEN;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("VERCEL_URL", originalVercelUrl);
    restoreEnv("NEXT_PUBLIC_APP_URL", originalPublicUrl);
    restoreEnv("DASHBOARD_ADMIN_TOKEN", originalAdminToken);
  });

  process.env.VERCEL_URL = "trusted-deployment.vercel.app";
  process.env.NEXT_PUBLIC_APP_URL = "https://canonical.example";
  process.env.DASHBOARD_ADMIN_TOKEN = "test-dashboard-admin-token";

  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await getDashboardOverview(
    { preset: "30d" },
    {
      cookie: "kh_session=sensitive-session",
      baseUrl: "https://attacker.example",
    },
  );

  assert.equal(
    String(capturedInput),
    "https://trusted-deployment.vercel.app/api/dashboard/overview?range=30d",
    "request-controlled origins must not select the destination that receives dashboard credentials",
  );

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("x-dashboard-secret"), "test-dashboard-admin-token");
  assert.equal(headers.get("cookie"), "kh_session=sensitive-session");
  assert.equal(capturedInit?.redirect, "error", "server credential fetches must fail closed on redirects");
});
