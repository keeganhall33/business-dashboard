import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const AGENT_MUTATION_ROUTES = [
  "src/app/api/agents/run-all/route.ts",
  "src/app/api/agents/run/[agentKey]/route.ts",
  "src/app/api/agents/nudge/[agentKey]/route.ts",
  "src/app/api/agents/plans/[id]/route.ts"
] as const;

function readRoute(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function postHandlerBody(source: string): string {
  const start = source.indexOf("export async function POST(");
  assert.ok(start >= 0, "route must expose a POST handler");
  return source.slice(start);
}

test("every agent execution or approval route authenticates before route logic", () => {
  for (const path of AGENT_MUTATION_ROUTES) {
    const source = readRoute(path);
    assert.match(
      source,
      /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/,
      `${path} must import the canonical dashboard auth boundary`
    );

    const handler = postHandlerBody(source);
    const authIndex = handler.indexOf("enforceDashboardAuth(request)");
    const tryIndex = handler.indexOf("try {");

    assert.match(handler, /POST\(request: Request/, `${path} must receive the request for authentication`);
    assert.ok(authIndex >= 0, `${path} must enforce dashboard auth`);
    assert.ok(tryIndex < 0 || authIndex < tryIndex, `${path} must authenticate before route execution`);
    assert.match(handler, /if \(authResponse\) return authResponse;/, `${path} must fail closed on rejected auth`);
  }
});

test("agent auth precedes execution, activation, and plan approval side effects", () => {
  const protectedOperations: Record<(typeof AGENT_MUTATION_ROUTES)[number], readonly string[]> = {
    "src/app/api/agents/run-all/route.ts": [
      'createSystemRun({ agentKey, runType: "manual" })',
      "await runners[agentKey]()"
    ],
    "src/app/api/agents/run/[agentKey]/route.ts": [
      "await context.params",
      "parseJsonBody(request, runAgentSchema)",
      "runAgentByKey(agentKey, parsed.data.runType"
    ],
    "src/app/api/agents/nudge/[agentKey]/route.ts": [
      "await context.params",
      "activateAgentTasks(agentKey, { includeAutoRunnable: true })",
      "publishAgentStatusSnapshot(agentKey)"
    ],
    "src/app/api/agents/plans/[id]/route.ts": [
      "await context.params",
      "getAgentPlanById(id)",
      "parseJsonBody(request, decidePlanSchema)",
      "writeAgentOutputs({",
      "activateAgentTasks(plan.agent_key, { includeAutoRunnable: true })",
      'updateAgentPlanStatus({ id: plan.id, status: "approved"'
    ]
  };

  for (const path of AGENT_MUTATION_ROUTES) {
    const handler = postHandlerBody(readRoute(path));
    const authIndex = handler.indexOf("enforceDashboardAuth(request)");
    assert.ok(authIndex >= 0, `${path} must enforce auth`);

    for (const operation of protectedOperations[path]) {
      const operationIndex = handler.indexOf(operation);
      assert.ok(operationIndex >= 0, `${path} expected protected operation ${operation}`);
      assert.ok(authIndex < operationIndex, `${path} auth must precede ${operation}`);
    }
  }
});
