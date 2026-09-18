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
  const afterSignature = start + signature.length;
  const next = source.indexOf("export async function ", afterSignature);
  return source.slice(start, next >= 0 ? next : undefined);
}

function assertDashboardAuthBefore(handler: string, operation: string, label: string) {
  const authIndex = handler.indexOf("enforceDashboardAuth(request)");
  const rejectIndex = handler.indexOf("if (authResponse) return authResponse;");
  const operationIndex = handler.indexOf(operation);

  assert.ok(authIndex >= 0, `${label} must enforce dashboard auth`);
  assert.ok(rejectIndex > authIndex, `${label} must fail closed on rejected auth`);
  assert.ok(operationIndex >= 0, `${label} expected protected operation ${operation}`);
  assert.ok(rejectIndex < operationIndex, `${label} auth must precede ${operation}`);
}

test("scoreboard metric writes authenticate before parsing or persistence", () => {
  const source = readRoute("src/app/api/metrics/readings/route.ts");
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);
  const handler = handlerFrom(source, "export async function POST(request: Request)");
  assertDashboardAuthBefore(handler, "parseJsonBody(request, createMetricReadingSchema)", "POST /api/metrics/readings");
  assertDashboardAuthBefore(handler, "createScoreboardMetricReading({", "POST /api/metrics/readings");
});

test("KPI definitions and readings authenticate before private reads or durable writes", () => {
  const definitions = readRoute("src/app/api/kpis/route.ts");
  assert.match(definitions, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);
  assertDashboardAuthBefore(
    handlerFrom(definitions, "export async function GET(request: Request)"),
    "listAgentKpis({",
    "GET /api/kpis"
  );
  const post = handlerFrom(definitions, "export async function POST(request: Request)");
  assertDashboardAuthBefore(post, "parseJsonBody(request, upsertKpiSchema)", "POST /api/kpis");
  assertDashboardAuthBefore(post, "upsertAgentKpiDefinition({", "POST /api/kpis");

  const readings = readRoute("src/app/api/kpis/[kpiKey]/readings/route.ts");
  assert.match(readings, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);
  const readingPost = handlerFrom(
    readings,
    "export async function POST(request: Request, context: { params: Promise<{ kpiKey: string }> })"
  );
  assertDashboardAuthBefore(readingPost, "await context.params", "POST /api/kpis/[kpiKey]/readings");
  assertDashboardAuthBefore(readingPost, "createAgentKpiReading({", "POST /api/kpis/[kpiKey]/readings");
});

test("finance snapshot writes authenticate before E2E bypass, parsing, or persistence", () => {
  const source = readRoute("src/app/api/finance/snapshot/route.ts");
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);
  const handler = handlerFrom(source, "export async function POST(request: Request)");
  assertDashboardAuthBefore(handler, 'process.env.E2E_TEST === "1"', "POST /api/finance/snapshot");
  assertDashboardAuthBefore(handler, "parseJsonBody(request, financeSchema)", "POST /api/finance/snapshot");
  assertDashboardAuthBefore(handler, "upsertFinanceSnapshot({", "POST /api/finance/snapshot");
});

test("industry interaction state authenticates before private reads and writes", () => {
  const source = readRoute("src/app/api/industry-pulse/interactions/route.ts");
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);
  assertDashboardAuthBefore(
    handlerFrom(source, "export async function GET(request: Request)"),
    'getSystemState("industry_pulse_interactions")',
    "GET /api/industry-pulse/interactions"
  );
  const patch = handlerFrom(source, "export async function PATCH(request: Request)");
  assertDashboardAuthBefore(patch, "parseJsonBody(request, industryPulsePatchSchema)", "PATCH /api/industry-pulse/interactions");
  assertDashboardAuthBefore(patch, 'getSystemState("industry_pulse_interactions")', "PATCH /api/industry-pulse/interactions");
  assertDashboardAuthBefore(patch, 'upsertSystemState("industry_pulse_interactions", updated)', "PATCH /api/industry-pulse/interactions");
});
