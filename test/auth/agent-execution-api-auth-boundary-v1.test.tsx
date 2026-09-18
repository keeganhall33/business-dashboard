import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const AGENT_EXECUTION_ROUTES = [
  "src/app/api/agents/run/[agentKey]/route.ts",
  "src/app/api/agents/run-all/route.ts",
  "src/app/api/agents/nudge/[agentKey]/route.ts",
  "src/app/api/agents/plans/[id]/route.ts"
] as const;

function readRoute(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function authIndex(source: string): number {
  return source.indexOf("enforceDashboardAuth(request)");
}

function assertAuthPrecedes(source: string, path: string, protectedOperation: string): void {
  const boundaryIndex = authIndex(source);
  const operationIndex = source.indexOf(protectedOperation);
  assert.ok(boundaryIndex >= 0, `${path} must enforce dashboard auth`);
  assert.ok(operationIndex >= 0, `${path} must contain protected operation ${protectedOperation}`);
  assert.ok(boundaryIndex < operationIndex, `${path} dashboard auth must precede ${protectedOperation}`);
}

test("every agent execution API fails closed through the canonical dashboard auth boundary", () => {
  for (const path of AGENT_EXECUTION_ROUTES) {
    const source = readRoute(path);
    assert.match(
      source,
      /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/,
      `${path} must import the canonical dashboard auth boundary`
    );
    assert.match(source, /export async function POST\(request: Request/, `${path} must authenticate the incoming request`);
    assert.match(source, /if \(authResponse\) return authResponse;/, `${path} must fail closed on rejected auth`);
  }
});

test("direct agent execution authenticates before identity parsing, request parsing, or execution", () => {
  const path = "src/app/api/agents/run/[agentKey]/route.ts";
  const source = readRoute(path);

  for (const operation of [
    "await context.params",
    "hasAgentRunner(agentKey)",
    "parseJsonBody(request, runAgentSchema)",
    "runAgentByKey(agentKey"
  ]) {
    assertAuthPrecedes(source, path, operation);
  }
});

test("bulk agent execution authenticates before creating runs or invoking any runner", () => {
  const path = "src/app/api/agents/run-all/route.ts";
  const source = readRoute(path);

  for (const operation of [
    "for (const agentKey of sequence)",
    "createSystemRun({ agentKey",
    "runners[agentKey]()",
    "finishSystemRun(run.id"
  ]) {
    assertAuthPrecedes(source, path, operation);
  }
});

test("agent nudge authenticates before resolving the agent, activating tasks, or publishing state", () => {
  const path = "src/app/api/agents/nudge/[agentKey]/route.ts";
  const source = readRoute(path);

  for (const operation of [
    "await context.params",
    "hasAgentRunner(agentKey)",
    "activateAgentTasks(agentKey",
    "publishAgentStatusSnapshot(agentKey)"
  ]) {
    assertAuthPrecedes(source, path, operation);
  }
});

test("agent plan decisions authenticate before reading, publishing, approving, or activating a plan", () => {
  const path = "src/app/api/agents/plans/[id]/route.ts";
  const source = readRoute(path);

  for (const operation of [
    "await context.params",
    "getAgentPlanById(id)",
    "parseJsonBody(request, decidePlanSchema)",
    "writeAgentOutputs({",
    "activateAgentTasks(plan.agent_key",
    'updateAgentPlanStatus({ id: plan.id, status: "approved"'
  ]) {
    assertAuthPrecedes(source, path, operation);
  }
});
