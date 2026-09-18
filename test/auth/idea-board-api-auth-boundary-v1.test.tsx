import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readRoute(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
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

test("Idea Board collection reads and creation authenticate before data access", () => {
  const source = readRoute("src/app/api/ideas/route.ts");
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);

  const getHandler = handlerFrom(source, "export async function GET(request: Request)");
  assertAuthBefore(getHandler, "new URL(request.url)", "GET /api/ideas");
  assertAuthBefore(getHandler, "getIdeas(parsed.data)", "GET /api/ideas");

  const postHandler = handlerFrom(source, "export async function POST(request: Request)");
  assertAuthBefore(postHandler, "parseJsonBody(request, createIdeaSchema)", "POST /api/ideas");
  assertAuthBefore(postHandler, "createIdea(parsed.data)", "POST /api/ideas");
});

test("Idea Board approval-capable status mutation authenticates before identity or status writes", () => {
  const source = readRoute("src/app/api/ideas/[id]/route.ts");
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);

  const handler = handlerFrom(source, "export async function PATCH(request: Request");
  assertAuthBefore(handler, "await context.params", "PATCH /api/ideas/[id]");
  assertAuthBefore(handler, "parseJsonBody(request, updateIdeaStatusSchema)", "PATCH /api/ideas/[id]");
  assertAuthBefore(handler, "updateIdeaStatus({", "PATCH /api/ideas/[id]");
});

test("Idea Board comments authenticate before caller attribution or persistence", () => {
  const source = readRoute("src/app/api/ideas/[id]/comments/route.ts");
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);

  const handler = handlerFrom(source, "export async function POST(request: Request");
  assertAuthBefore(handler, "await context.params", "POST /api/ideas/[id]/comments");
  assertAuthBefore(handler, "parseJsonBody(request, createIdeaCommentSchema)", "POST /api/ideas/[id]/comments");
  assertAuthBefore(handler, "createIdeaComment({", "POST /api/ideas/[id]/comments");
});
