import test from "node:test";
import assert from "node:assert/strict";

import { PolicyRefSchema } from "@/lib/external-intelligence/contracts/policy-ref";

test("PolicyRefSchema rejects unknown enum", () => {
  assert.throws(() =>
    PolicyRefSchema.parse({
      policy_name: "confidence",
      semantic_version: "v1.0.0",
      content_hash: "a".repeat(64),
      effective_from: "2026-08-04",
      effective_until: null,
      approval_status: "maybe",
      approved_by: null,
      changed_at: null,
      change_reason: "fixture"
    })
  );
});
