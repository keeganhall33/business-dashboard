import test from "node:test";
import assert from "node:assert/strict";

import { getHarnessGateOverrides } from "@/lib/actions/execution/api-actor";

test("harness gate overrides parse only in harness mode", () => {
  const req = new Request("https://local.invalid", {
    headers: {
      "x-m12-harness": "1",
      "x-m12-adapter-enabled": "0",
      "x-m12-execution-boundary-enabled": "0",
      "x-m12-mock-execution-enabled": "1",
      "x-m12-category-enabled": "0",
      "x-m12-emergency-stop": "1"
    }
  });

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  try {
    const o = getHarnessGateOverrides(req);
    assert.equal(o.adapterEnabled, false);
    assert.equal(o.executionBoundaryEnabled, false);
    assert.equal(o.mockExecutionEnabled, true);
    assert.equal(o.categoryEnabled, false);
    assert.equal(o.emergencyStop, true);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

