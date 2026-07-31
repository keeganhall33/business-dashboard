import test from "node:test";
import assert from "node:assert/strict";

import { getExecutionActor } from "@/lib/actions/execution/api-actor";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { executionError } from "@/lib/api/execution-responses";

test("api actor: request headers cannot control actor identity", () => {
  const req = new Request("https://local.invalid", {
    method: "POST",
    headers: {
      "x-m12-harness": "1"
    }
  });
  const actor = getExecutionActor(req);
  assert.deepEqual(actor, { actor: "dashboard", synthetic: false });
});

test("executionError maps domain codes to stable API codes and non-500 status", async () => {
  const res = executionError(
    new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "x", httpStatus: 400 }),
    "fallback"
  );
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "dry_run_required");
  assert.equal(res.status, 400);
});
