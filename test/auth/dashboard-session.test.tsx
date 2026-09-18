import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DASHBOARD_ALLOWED_EMAIL,
  DASHBOARD_SESSION_COOKIE,
  DASHBOARD_SESSION_TTL_SECONDS,
  canBypassDashboardAuth,
  getDashboardSessionSecret,
  issueDashboardSession,
  verifyDashboardAccessAttempt,
  verifyDashboardSession
} from "@/lib/auth/dashboard-session";

const SECRET = "test-dashboard-secret";
const NOW = Date.parse("2026-09-18T00:00:00.000Z");

test("accepts only Keegan's approved email and the exact access code", () => {
  const testAccessCode = "test-only-access-code";
  const testAccessHash = createHash("sha256").update(testAccessCode).digest("hex");
  assert.equal(DASHBOARD_ALLOWED_EMAIL, "keegan@keeganhall.com");
  assert.equal(verifyDashboardAccessAttempt(" KEEGAN@KEEGANHALL.COM ", testAccessCode, testAccessHash), true);
  assert.equal(verifyDashboardAccessAttempt("keeganhall@gmail.com", testAccessCode, testAccessHash), false);
  assert.equal(verifyDashboardAccessAttempt(DASHBOARD_ALLOWED_EMAIL, `${testAccessCode}x`, testAccessHash), false);
  assert.equal(verifyDashboardAccessAttempt(DASHBOARD_ALLOWED_EMAIL, testAccessCode), false);
});

test("issues a bounded signed session and rejects expiry or tampering", () => {
  const token = issueDashboardSession({ email: DASHBOARD_ALLOWED_EMAIL, secret: SECRET, now: NOW });
  assert.deepEqual(verifyDashboardSession({ token, secret: SECRET, now: NOW }), {
    email: DASHBOARD_ALLOWED_EMAIL,
    expiresAt: Math.floor(NOW / 1000) + DASHBOARD_SESSION_TTL_SECONDS
  });
  assert.equal(verifyDashboardSession({ token, secret: SECRET, now: NOW + DASHBOARD_SESSION_TTL_SECONDS * 1000 }), null);
  assert.equal(verifyDashboardSession({ token: `${token}x`, secret: SECRET, now: NOW }), null);
  assert.equal(verifyDashboardSession({ token, secret: `${SECRET}x`, now: NOW }), null);
});

test("production fails closed when the dashboard secret is absent", () => {
  assert.equal(getDashboardSessionSecret({ NODE_ENV: "production" }), null);
  assert.equal(canBypassDashboardAuth({ NODE_ENV: "production" }), false);
  assert.equal(canBypassDashboardAuth({ NODE_ENV: "development" }), true);
  assert.equal(canBypassDashboardAuth({ NODE_ENV: "development", DASHBOARD_ADMIN_TOKEN: SECRET }), false);
});

test("server layout and proxy both enforce the signed session boundary", () => {
  const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
  const proxy = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");
  const loginRoute = readFileSync(resolve(process.cwd(), "src/app/api/auth/login/route.ts"), "utf8");
  const sessionSource = readFileSync(resolve(process.cwd(), "src/lib/auth/dashboard-session.ts"), "utf8");
  assert.match(layout, /verifyDashboardSession/);
  assert.match(layout, /redirect\(secret \? "\/login"/);
  assert.match(proxy, /verifyDashboardSession/);
  assert.match(proxy, /NextResponse\.redirect/);
  assert.match(sessionSource, new RegExp(DASHBOARD_SESSION_COOKIE));
  assert.match(loginRoute, /name: DASHBOARD_SESSION_COOKIE/);
  assert.match(loginRoute, /httpOnly: true/);
  assert.match(loginRoute, /sameSite: "strict"/);
  assert.match(loginRoute, /secure: process\.env\.NODE_ENV === "production"/);
});
