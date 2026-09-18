import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routePath = "src/app/api/telemetry/events/route.ts";

function readRoute(): string {
  return readFileSync(resolve(process.cwd(), routePath), "utf8");
}

test("telemetry ingestion authenticates before parsing or emitting caller-controlled data", () => {
  const source = readRoute();
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);

  const handlerStart = source.indexOf("export async function POST(request: Request)");
  assert.ok(handlerStart >= 0, "missing POST /api/telemetry/events handler");
  const handler = source.slice(handlerStart);

  const authIndex = handler.indexOf("enforceDashboardAuth(request)");
  const rejectIndex = handler.indexOf("if (authResponse) return authResponse;");
  const parseIndex = handler.indexOf("parseJsonBody(request, telemetryEventSchema)");
  const logIndex = handler.indexOf('console.info("[business-dashboard.telemetry]"');

  assert.ok(authIndex >= 0, "telemetry POST must enforce dashboard auth");
  assert.ok(rejectIndex > authIndex, "telemetry POST must fail closed on rejected auth");
  assert.ok(parseIndex > rejectIndex, "auth must run before caller-controlled telemetry is parsed");
  assert.ok(logIndex > parseIndex, "auth and validation must run before telemetry reaches server logs");
});
