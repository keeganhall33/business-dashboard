import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { getDashboardOverview } from "@/lib/api/dashboard";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("dashboard overview ignores caller-controlled origins for authenticated internal fetches", async (t) => {
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
    } as unknown as NonNullable<Parameters<typeof getDashboardOverview>[1]>,
  );

  assert.ok(capturedInput, "overview fetch should execute");
  assert.equal(
    String(capturedInput),
    "https://trusted-deployment.vercel.app/api/dashboard/overview?range=30d",
    "server fetch must use the deployment-owned origin instead of a caller/request-controlled host",
  );

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("x-dashboard-secret"), "test-dashboard-admin-token");
  assert.equal(headers.get("cookie"), "kh_session=sensitive-session");
  assert.equal(capturedInit?.redirect, "error", "auth-bearing server fetches must not follow redirects");
});

test("authenticated dashboard overview callers do not derive internal API origins from request headers", () => {
  const callerPaths = [
    "src/app/(app)/dashboard/page.tsx",
    "src/app/(app)/opportunities-actions/page.tsx",
    "src/app/(app)/specialists/page.tsx",
    "src/app/api/ask-jeeves/route.ts",
  ];

  for (const callerPath of callerPaths) {
    const source = readFileSync(resolve(process.cwd(), callerPath), "utf8");
    assert.doesNotMatch(source, /x-forwarded-host/i, callerPath);
    assert.doesNotMatch(source, /x-forwarded-proto/i, callerPath);
    assert.doesNotMatch(source, /hdrs\.get\("host"\)/, callerPath);
    assert.doesNotMatch(source, /baseUrl/, callerPath);
  }

  const apiSource = readFileSync(resolve(process.cwd(), "src/lib/api/dashboard.ts"), "utf8");
  assert.match(apiSource, /const vercelOrigin = normalizeOrigin\(process\.env\.VERCEL_URL, "https:"\);/);
  assert.match(apiSource, /assertTrustedServerFetchTarget\(input\);/);
  assert.match(apiSource, /targetUrl\.origin !== trustedUrl\.origin/);
  assert.match(apiSource, /redirect: isServer \? "error" : init\?\.redirect/);
});
