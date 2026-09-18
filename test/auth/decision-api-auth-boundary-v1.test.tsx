import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROUTE = "src/app/api/decisions/route.ts";

function readRoute(): string {
  return readFileSync(resolve(process.cwd(), ROUTE), "utf8");
}

test("decision creation enforces dashboard auth before parsing or persistence", () => {
  const source = readRoute();
  assert.match(source, /import \{ enforceDashboardAuth \} from "@\/lib\/auth\/dashboard";/);

  const authIndex = source.indexOf("enforceDashboardAuth(request)");
  const parseIndex = source.indexOf("parseJsonBody(request, createDecisionSchema)");
  const createIndex = source.indexOf("createDecision(parsed.data)");
  const tryIndex = source.indexOf("try {");

  assert.ok(authIndex >= 0, "decision POST must enforce dashboard auth");
  assert.match(source, /if \(authResponse\) return authResponse;/);
  assert.ok(tryIndex < 0 || authIndex < tryIndex, "auth must run before route logic");
  assert.ok(parseIndex >= 0 && authIndex < parseIndex, "auth must precede decision body parsing");
  assert.ok(createIndex >= 0 && authIndex < createIndex, "auth must precede durable decision creation");
});
