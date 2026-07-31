import test from "node:test";
import assert from "node:assert/strict";

import { executionActionStateHash } from "@/lib/actions/execution/action-state-hash";
import type { DurableAction } from "@/lib/actions/action-contract";

function baseAction(): DurableAction {
  return {
    id: "a1",
    recommendation_id: "r",
    opportunity_id: null,
    title: "t",
    description: null,
    category: "email",
    channel: "email",
    approval_level: "L1_RECOMMENDATION",
    affected_products: ["store"],
    affected_audiences: ["all"],
    current_level: "L4_APPROVED_FOR_EXECUTION",
    status: "approved",
    priority_score: { overallScore: 1 },
    confidence: "possible",
    expected_outcome: null,
    estimated_impact: {},
    estimated_cost: { usd: 0 },
    estimated_effort: {},
    risk: "medium",
    evidence_snapshot_id: "s1",
    evidence_snapshot_hash: "h1",
    evidence_snapshot: null,
    assumptions: [],
    limitations: [],
    prepared_assets: [{ k: 1 }],
    execution_plan: { preview: "p" },
    approval_requirements: {},
    last_idempotency_key: null,
    approved_by: "ceo",
    approved_at: "2026-01-01T00:00:00.000Z",
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    snoozed_until: null,
    expires_at: null,
    executed_at: null,
    measurement_window: {},
    baseline_snapshot: null,
    result_snapshot: null,
    outcome: null,
    lessons: null,
    recommendation_fingerprint: "fp",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

test("executionActionStateHash is deterministic (test vector)", () => {
  const h = executionActionStateHash(baseAction());
  assert.equal(h, executionActionStateHash(baseAction()));
  assert.equal(h, "77943da4489e958151d5b4fa0387ac7a94401e0f1ea572fb1bd624b747826f0f");
});

test("executionActionStateHash changes when material fields change", () => {
  const a = baseAction();
  const h1 = executionActionStateHash(a);
  const h2 = executionActionStateHash({ ...a, prepared_assets: [{ k: 2 }] });
  assert.notEqual(h1, h2);
});
