import test from "node:test";
import assert from "node:assert/strict";

import { loadPolicyFile } from "@/lib/external-intelligence/config/load-policy";

test("policy loader rejects mismatched policy_name", () => {
  assert.throws(() => loadPolicyFile({ policy_name: "confidence", semantic_version: "v1.0.0" + "x" }));
});

test("policy loader rejects fixture production use", () => {
  assert.throws(() =>
    loadPolicyFile({ policy_name: "confidence", semantic_version: "v1.0.0", require_production_eligible: true })
  );
});
