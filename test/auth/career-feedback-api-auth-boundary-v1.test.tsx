import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routePath = "src/app/api/career/feedback/route.ts";

function readRoute(): string {
  return readFileSync(resolve(process.cwd(), routePath), "utf8");
}

function handlerFrom(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing handler ${signature}`);
  return source.slice(start);
}

function assertAuthBefore(handler: string, operation: string, label: string) {
  const authIndex = handler.indexOf("enforceDashboardAuth(request)");
  const operationIndex = handler.indexOf(operation);
  assert.ok(authIndex >= 0, `${label} must enforce dashboard auth`);
  assert.match(handler, /if \(authResponse\) return authResponse;/, `${label} must fail closed on rejected auth`);
  assert.ok(operationIndex >= 0, `${label} expected protected operation ${operation}`);
  assert.ok(authIndex < operationIndex, `${label} auth must precede ${operation}`);
}

test("career operating-system snapshot authenticates before outcome-memory reads", () => {
  const source = readRoute();
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);

  const handler = handlerFrom(source, "export async function GET(request: Request)");
  assertAuthBefore(handler, "getSnapshot()", "GET /api/career/feedback");
  assertAuthBefore(handler, "getRecentOutcomeMemory({", "GET /api/career/feedback");
});

test("career feedback authenticates before request parsing and durable outcome writes", () => {
  const source = readRoute();
  const handler = handlerFrom(source, "export async function POST(request: Request)");

  assertAuthBefore(handler, "request.json()", "POST /api/career/feedback");
  assertAuthBefore(handler, "createOutcomeMemory({", "POST /api/career/feedback");
  assertAuthBefore(handler, "getSnapshot()", "POST /api/career/feedback");
});
