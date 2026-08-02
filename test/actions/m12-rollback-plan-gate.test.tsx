import test from "node:test";
import assert from "node:assert/strict";

import { hasRollbackPlan } from "@/lib/actions/execution/rollback-plan";

test("hasRollbackPlan is deny-by-default", () => {
  assert.equal(hasRollbackPlan({}), false);
  assert.equal(hasRollbackPlan({ rollback_plan: null }), false);
  assert.equal(hasRollbackPlan({ rollback_plan: "x" }), false);
  assert.equal(hasRollbackPlan({ rollback_plan: {} }), true);
  assert.equal(hasRollbackPlan({ rollback_plan: { hash: "h", raw: {} } }), true);
});
