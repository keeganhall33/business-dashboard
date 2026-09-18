import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const AUTOMATION_MUTATION_ROUTES = [
  "src/app/api/automation/evaluate-rules/route.ts",
  "src/app/api/automation/idea-board/sync-review-tasks/route.ts",
  "src/app/api/automation/run-job/route.ts",
  "src/app/api/automation/weekly-cycle/route.ts"
] as const;

function readRoute(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function postHandlerBody(source: string): string {
  const start = source.indexOf("export async function POST(");
  assert.ok(start >= 0, "route must expose a POST handler");
  return source.slice(start);
}

test("every automation mutation route enforces dashboard auth before route logic", () => {
  for (const path of AUTOMATION_MUTATION_ROUTES) {
    const source = readRoute(path);
    assert.match(
      source,
      /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/,
      `${path} must import the canonical dashboard auth boundary`
    );

    const handler = postHandlerBody(source);
    const authIndex = handler.indexOf("enforceDashboardAuth(request)");
    const tryIndex = handler.indexOf("try {");

    assert.match(handler, /POST\(request: Request\)/, `${path} must receive the request for authentication`);
    assert.ok(authIndex >= 0, `${path} must enforce dashboard auth`);
    assert.ok(tryIndex < 0 || authIndex < tryIndex, `${path} must authenticate before route execution`);
    assert.match(handler, /if \(authResponse\) return authResponse;/, `${path} must fail closed on rejected auth`);
  }
});

test("automation auth precedes high-risk persistence, fixture, job, and agent execution", () => {
  const protectedOperations: Record<(typeof AUTOMATION_MUTATION_ROUTES)[number], readonly string[]> = {
    "src/app/api/automation/evaluate-rules/route.ts": [
      'createSystemRun({ agentKey: "avery", runType: "rule_evaluation" })',
      "evaluateRules()"
    ],
    "src/app/api/automation/idea-board/sync-review-tasks/route.ts": [
      'process.env.E2E_TEST === "1"',
      "getIdeas({ limit: 500 })",
      "createTask({",
      "linkIdeaToTask({",
      "updateIdeaStatus({"
    ],
    "src/app/api/automation/run-job/route.ts": ["request.json()", "await runner()"],
    "src/app/api/automation/weekly-cycle/route.ts": [
      'createSystemRun({ agentKey: "avery", runType: "weekly" })',
      "evaluateRules()",
      "await runners[agentKey]()"
    ]
  };

  for (const path of AUTOMATION_MUTATION_ROUTES) {
    const source = readRoute(path);
    const handler = postHandlerBody(source);
    const authIndex = handler.indexOf("enforceDashboardAuth(request)");
    assert.ok(authIndex >= 0, `${path} must enforce auth`);

    for (const operation of protectedOperations[path]) {
      const operationIndex = handler.indexOf(operation);
      assert.ok(operationIndex >= 0, `${path} expected protected operation ${operation}`);
      assert.ok(authIndex < operationIndex, `${path} auth must precede ${operation}`);
    }
  }
});
