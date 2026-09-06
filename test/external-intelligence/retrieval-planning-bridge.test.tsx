import test from "node:test";
import assert from "node:assert/strict";

import { buildRetrievalPlanFromSourceSelectionV1 } from "../../src/lib/external-intelligence/retrieval-planning/retrieval-plan-bridge-v1";
import { RetrievalPlanV1Schema } from "../../src/lib/external-intelligence/retrieval-planning/retrieval-plan.contract";

test("buildRetrievalPlanFromSourceSelectionV1 preserves source ids/order and emits explicit gap/unavailable", () => {
  const plan = buildRetrievalPlanFromSourceSelectionV1({
    planned_at: "2026-08-14T00:00:00.000Z",
    selected_sources: [
      {
        source_id: "src_a",
        tier: { kind: "TIER", tier: "TIER_B_PRIMARY_EXTERNAL", reasons: [] },
        availability: "available",
        freshness: { expected_cadence: "daily", freshness_threshold: "7d" },
        selected: true
      } as any,
      {
        source_id: "src_b",
        tier: { kind: "SOURCE_COVERAGE_GAP", missing: ["authority_level"], reasons: ["missing"] },
        availability: "unknown",
        freshness: null,
        selected: true
      } as any,
      {
        source_id: "src_c",
        tier: { kind: "TIER", tier: "TIER_D_OPEN_WEB_DISCOVERY", reasons: [] },
        availability: "unavailable",
        freshness: null,
        selected: true
      } as any
    ]
  });

  const parsed = RetrievalPlanV1Schema.parse(plan);
  assert.equal(parsed.intents.map((i) => i.source_id).join(","), "src_a,src_b,src_c");
  assert.equal(parsed.intents[0]?.status, "PLANNED");
  assert.equal(parsed.intents[1]?.status, "SOURCE_COVERAGE_GAP");
  assert.equal(parsed.intents[2]?.status, "SKIP_UNAVAILABLE");
});

