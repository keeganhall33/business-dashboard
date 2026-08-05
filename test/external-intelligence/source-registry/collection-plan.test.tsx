import test from "node:test";
import assert from "node:assert/strict";

import { parseCollectionPlan, createCollectionPlanHash } from "@/lib/external-intelligence/config/collection-plan.contract";

test("collection plan: cannot be created for ineligible source", () => {
  assert.throws(() => {
    parseCollectionPlan({
      collection_plan_id: "plan_12345678",
      source_id: "sports.major_leagues.official",
      source_config_version: "v1.0.0",
      registry_hash: "a".repeat(64),
      source_sets_hash: "b".repeat(64),
      policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "c".repeat(64) }],
      collection_mode: "automated",
      access_method: "rss",
      cadence: "daily",
      freshness_threshold: "7d",
      permitted_artifact_types: ["metadata"],
      retention_policy: "link_only",
      legal_restrictions: [],
      expected_outputs: ["evidence_reference"],
      eligibility_evaluation: { allowed: false, allowed_modes: ["disabled"], blocking_reasons: ["blocked"], warnings: [], review_required: true, review_by: "legal", governing_source_config_version: "v1.0.0", governing_registry_version: "v1.0.0", governing_policy_refs: [], evaluation_fingerprint: "d".repeat(64) },
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-02T00:00:00.000Z"
    });
  }, /collection_plan_ineligible/);
});

test("collection plan hashing: deterministic", () => {
  const eligible = {
    allowed: true,
    allowed_modes: ["manual"],
    blocking_reasons: [],
    warnings: [],
    review_required: false,
    review_by: null,
    governing_source_config_version: "v1.0.0",
    governing_registry_version: "v1.0.0",
    governing_policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "c".repeat(64) }],
    evaluation_fingerprint: "e".repeat(64)
  };

  const plan = parseCollectionPlan({
    collection_plan_id: "plan_abcdefgh",
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    registry_hash: "a".repeat(64),
    source_sets_hash: "b".repeat(64),
    policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "c".repeat(64) }],
    collection_mode: "manual",
    access_method: "official_api",
    cadence: "monthly",
    freshness_threshold: "90d",
    permitted_artifact_types: ["metadata"],
    retention_policy: "link_only",
    legal_restrictions: [],
    expected_outputs: ["evidence_reference"],
    eligibility_evaluation: eligible,
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2026-01-02T00:00:00.000Z"
  });

  const h1 = createCollectionPlanHash(plan);
  const h2 = createCollectionPlanHash(plan);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});
