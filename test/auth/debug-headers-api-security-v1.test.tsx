import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routePath = "src/app/api/debug/headers/route.ts";

function readRoute(): string {
  return readFileSync(resolve(process.cwd(), routePath), "utf8");
}

test("debug header diagnostics authenticate before reading or returning request headers", () => {
  const source = readRoute();
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);

  const handlerIndex = source.indexOf("export async function GET(request: Request)");
  assert.ok(handlerIndex >= 0, "debug headers route must accept the request so it can enforce auth");

  const handler = source.slice(handlerIndex);
  const authIndex = handler.indexOf("enforceDashboardAuth(request)");
  const failClosedIndex = handler.indexOf("if (authResponse) return authResponse;");
  const headerReadIndex = handler.indexOf("request.headers.get(name)");
  const responseIndex = handler.indexOf("Response.json");

  assert.ok(authIndex >= 0, "debug headers route must enforce canonical dashboard auth");
  assert.ok(failClosedIndex > authIndex, "rejected auth must return before diagnostics continue");
  assert.ok(headerReadIndex > failClosedIndex, "authentication must precede all request-header reads");
  assert.ok(responseIndex > headerReadIndex, "diagnostics may respond only after authenticated safe-header reads");
});

test("debug diagnostics expose only a bounded non-secret header allowlist", () => {
  const source = readRoute();

  assert.match(
    source,
    /const SAFE_DIAGNOSTIC_HEADER_NAMES = \[\s*"host",\s*"x-forwarded-host",\s*"x-forwarded-proto",\s*"x-vercel-id"\s*\] as const;/s
  );

  assert.doesNotMatch(source, /from "next\/headers"/);
  assert.doesNotMatch(source, /\.entries\(\)/);
  assert.doesNotMatch(source, /Array\.from\(/);

  for (const forbiddenHeader of [
    "authorization",
    "cookie",
    "set-cookie",
    "x-dashboard-secret",
    "x-forwarded-for",
    "x-real-ip"
  ]) {
    assert.ok(
      !source.toLowerCase().includes(`"${forbiddenHeader}"`),
      `debug diagnostics must not expose ${forbiddenHeader}`
    );
  }
});
