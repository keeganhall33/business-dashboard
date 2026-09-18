import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROUTES = [
  "src/app/api/opportunities/route.ts",
  "src/app/api/opportunities/[id]/route.ts",
  "src/app/api/collectors/route.ts"
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

test("opportunity and collector APIs enforce dashboard auth before route logic", () => {
  for (const path of ROUTES) {
    const source = readRoute(path);
    assert.match(
      source,
      /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/,
      `${path} must import the canonical dashboard auth boundary`
    );

    const handlers = exportedHandlerBodies(source);
    assert.ok(handlers.length > 0, `${path} must expose at least one handler`);

    for (const handler of handlers) {
      const authIndex = handler.body.indexOf("enforceDashboardAuth(request)");
      const tryIndex = handler.body.indexOf("try {");
      assert.ok(authIndex >= 0, `${path} ${handler.method} must enforce dashboard auth`);
      assert.ok(
        tryIndex < 0 || authIndex < tryIndex,
        `${path} ${handler.method} must authenticate before parsing, fixture bypasses, reads, or writes`
      );
      assert.match(
        handler.body,
        /if \(authResponse\) return authResponse;/,
        `${path} ${handler.method} must fail closed on rejected auth`
      );
    }
  }
});

test("collector fixture and persistence cannot run before auth", () => {
  const source = readRoute("src/app/api/collectors/route.ts");
  const authIndex = source.indexOf("enforceDashboardAuth(request)");
  assert.ok(authIndex >= 0);

  for (const protectedOperation of [
    'process.env.E2E_TEST === "1"',
    "createCollectorRelationship(parsed.data)"
  ]) {
    const operationIndex = source.indexOf(protectedOperation);
    assert.ok(operationIndex >= 0, `expected protected operation ${protectedOperation}`);
    assert.ok(authIndex < operationIndex, `dashboard auth must precede ${protectedOperation}`);
  }
});

test("opportunity reads and creation cannot run before auth", () => {
  const collection = readRoute("src/app/api/opportunities/route.ts");
  const detail = readRoute("src/app/api/opportunities/[id]/route.ts");
  const collectionAuthIndex = collection.indexOf("enforceDashboardAuth(request)");
  const detailAuthIndex = detail.indexOf("enforceDashboardAuth(request)");
  assert.ok(collectionAuthIndex >= 0);
  assert.ok(detailAuthIndex >= 0);

  for (const protectedOperation of ["getOpportunities(parsed.data)", "createOpportunity(parsed.data)"]) {
    const operationIndex = collection.indexOf(protectedOperation);
    assert.ok(operationIndex >= 0, `expected protected operation ${protectedOperation}`);
    assert.ok(collectionAuthIndex < operationIndex, `dashboard auth must precede ${protectedOperation}`);
  }

  const detailReadIndex = detail.indexOf("getOpportunityById(id)");
  assert.ok(detailReadIndex >= 0);
  assert.ok(detailAuthIndex < detailReadIndex, "dashboard auth must precede opportunity detail reads");
});
