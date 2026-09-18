import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  DASHBOARD_ALLOWED_EMAIL,
  canBypassDashboardAuth
} from "@/lib/auth/dashboard-session";
import { EXECUTIVE_WORKSPACE_NAV_V1 } from "@/lib/executive-workspace/ia";

function appPageForHref(href: string): string {
  const pathname = href.split(/[?#]/, 1)[0];
  assert.ok(pathname.startsWith("/"), `expected internal route, got ${href}`);
  return resolve(process.cwd(), "src/app/(app)", pathname.slice(1), "page.tsx");
}

const V1_CRM_ROUTES = [
  "/relationships",
  "/relationships/people",
  "/relationships/companies",
  "/relationships/activity",
  "/opportunities-actions"
] as const;

test("every canonical V1 executive workspace resolves to a real app route", () => {
  const ids = new Set<string>();
  const hrefs = new Set<string>();

  for (const workspace of EXECUTIVE_WORKSPACE_NAV_V1) {
    assert.ok(!ids.has(workspace.id), `duplicate workspace id ${workspace.id}`);
    assert.ok(!hrefs.has(workspace.href), `duplicate workspace href ${workspace.href}`);
    ids.add(workspace.id);
    hrefs.add(workspace.href);

    assert.ok(
      existsSync(appPageForHref(workspace.href)),
      `${workspace.id} points at missing route ${workspace.href}`
    );
  }

  assert.deepEqual(
    [...ids].sort(),
    [
      "ASK_JEEVES",
      "DATA_EVIDENCE",
      "EVENTS_MARKET_WINDOWS",
      "EXECUTIVE_HOME",
      "LEARNING",
      "OPPORTUNITIES_ACTIONS",
      "RELATIONSHIPS_CRM",
      "SPECIALISTS",
      "STRATEGY"
    ]
  );
});

test("V1 CRM directories and activity routes cannot disappear silently", () => {
  for (const href of V1_CRM_ROUTES) {
    assert.ok(existsSync(appPageForHref(href)), `missing V1 business route ${href}`);
  }
});

test("production dashboard authentication remains fail-closed and email-scoped", () => {
  assert.equal(DASHBOARD_ALLOWED_EMAIL, "keegan@keeganhall.com");
  assert.equal(canBypassDashboardAuth({ NODE_ENV: "production" }), false);
  assert.equal(
    canBypassDashboardAuth({ NODE_ENV: "production", DASHBOARD_ADMIN_TOKEN: "present" }),
    false
  );
});

test("production smoke proves exact release propagation and private-login behavior", () => {
  const smoke = readFileSync(resolve(process.cwd(), "scripts/smoke-check.sh"), "utf8");
  const workflow = readFileSync(
    resolve(process.cwd(), ".github/workflows/validated-main-deploy.yml"),
    "utf8"
  );

  assert.match(smoke, /EXPECTED_RELEASE_SHA/);
  assert.match(smoke, /releaseSha/);
  assert.match(smoke, /\/login/);
  assert.match(smoke, /\/api\/dashboard\/overview/);
  assert.match(workflow, /EXPECTED_RELEASE_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /\.\/scripts\/smoke-check\.sh/);
  assert.match(workflow, /cancel-in-progress:\s*true/);

  const smokeProtectedRoutes = new Set([
    ...EXECUTIVE_WORKSPACE_NAV_V1.map((workspace) => workspace.href),
    ...V1_CRM_ROUTES
  ]);
  for (const href of smokeProtectedRoutes) {
    assert.ok(
      smoke.includes(`"${href}"`),
      `production smoke is missing canonical V1 protected route ${href}`
    );
  }
});
