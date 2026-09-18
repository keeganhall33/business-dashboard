import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const TASK_API_ROUTES = [
  "src/app/api/tasks/route.ts",
  "src/app/api/tasks/[id]/approve/route.ts",
  "src/app/api/tasks/[id]/reject/route.ts",
  "src/app/api/tasks/[id]/complete/route.ts",
  "src/app/api/tasks/[id]/status/route.ts"
] as const;

function readRoute(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function exportedHandlerBodies(source: string): Array<{ method: string; body: string }> {
  const starts = [...source.matchAll(/export async function (GET|POST|PATCH)\(/g)];
  return starts.map((match, index) => ({
    method: match[1],
    body: source.slice(match.index, starts[index + 1]?.index ?? source.length)
  }));
}

test("every task API handler enforces dashboard auth before route logic", () => {
  for (const path of TASK_API_ROUTES) {
    const source = readRoute(path);
    assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/, `${path} must import the canonical dashboard auth boundary`);

    const handlers = exportedHandlerBodies(source);
    assert.ok(handlers.length > 0, `${path} must expose at least one handler`);

    for (const handler of handlers) {
      const authIndex = handler.body.indexOf("enforceDashboardAuth(request)");
      const tryIndex = handler.body.indexOf("try {");
      assert.ok(authIndex >= 0, `${path} ${handler.method} must enforce dashboard auth`);
      assert.ok(tryIndex < 0 || authIndex < tryIndex, `${path} ${handler.method} must authenticate before parsing, fixture bypasses, reads, or writes`);
      assert.match(handler.body, /if \(authResponse\) return authResponse;/, `${path} ${handler.method} must fail closed on rejected auth`);
    }
  }
});

test("task approval cannot reach fixture bypass, approval mutation, or agent execution before auth", () => {
  const source = readRoute("src/app/api/tasks/[id]/approve/route.ts");
  const authIndex = source.indexOf("enforceDashboardAuth(request)");
  assert.ok(authIndex >= 0);

  for (const protectedOperation of [
    'process.env.E2E_TEST === "1"',
    "getTaskById(id)",
    "updateTaskApproval(id, parsed.data.approvedByUser)",
    "activateAgentTasks(existing.agent_key)",
    'runAgentByKey(existing.agent_key, "manual"'
  ]) {
    const operationIndex = source.indexOf(protectedOperation);
    assert.ok(operationIndex >= 0, `expected protected operation ${protectedOperation}`);
    assert.ok(authIndex < operationIndex, `dashboard auth must precede ${protectedOperation}`);
  }
});
