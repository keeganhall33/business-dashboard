import test from "node:test";
import assert from "node:assert/strict";

import { parseCollectionPlan, createCollectionPlanHash } from "@/lib/external-intelligence/config/collection-plan.contract";

test("collection plan: rejects potential-but-not-current eligibility", () => {
  assert.throws(() => {
    parseCollectionPlan({
      collection_plan_id: "plan_12345678",
      source_id: "sports.major_leagues.official",
      source_config_version: "v1.0.0",
      registry_schema_version: "production_source_registry_v1",
      registry_hash: "a".repeat(64),
      source_sets_hash: "b".repeat(64),
      policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "c".repeat(64) }],
      eligibility_evaluation: {
        allowed: false,
        allowed_now: false,
        currently_allowed_modes: [],
        potentially_permitted_modes: ["manual"],
        pathway_requirements_by_mode: { automated: [], manual: ["legal_review_current"], metadata_only: [] },
        universal_blockers: ["source_disabled"],
        mode_specific_blockers: { automated: [], manual: [], metadata_only: [] },
        blocking_reasons: ["source_disabled"],
        warnings: [],
        review_required: true,
        review_by: "legal",
        lifecycle_status: "trial",
        implementation_status: "unimplemented",
        access_status: "unknown",
        governing_source_config_version: "v1.0.0",
        governing_registry_version: "v1.0.0",
        governing_registry_hash: "a".repeat(64),
        governing_source_sets_hash: "b".repeat(64),
        governing_policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "c".repeat(64) }],
        evaluation_fingerprint: "e".repeat(64)
      },
      collection_mode: "manual",
      access_method: "public_web",
      expected_cadence: "weekly",
      freshness_threshold: "30d",
      permitted_artifact_types: ["metadata"],
      retention_policy: "link_only",
      legal_restrictions: [],
      expected_outputs: ["evidence_reference"],
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-02T00:00:00.000Z"
    });
  }, /collection_plan_ineligible_now/);
});

test("collection plan hashing: deterministic", () => {
  const eligible = {
    allowed: true,
    allowed_now: true,
    currently_allowed_modes: ["manual"],
    potentially_permitted_modes: ["manual"],
    pathway_requirements_by_mode: { automated: [], manual: [], metadata_only: [] },
    universal_blockers: [],
    mode_specific_blockers: { automated: [], manual: [], metadata_only: [] },
    blocking_reasons: [],
    warnings: [],
    review_required: false,
    review_by: null,
    lifecycle_status: "active",
    implementation_status: "operational",
    access_status: "working",
    governing_source_config_version: "v1.0.0",
    governing_registry_version: "v1.0.0",
    governing_registry_hash: "a".repeat(64),
    governing_source_sets_hash: "b".repeat(64),
    governing_policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "c".repeat(64) }],
    evaluation_fingerprint: "e".repeat(64)
  };

  const plan = parseCollectionPlan({
    collection_plan_id: "plan_abcdefgh",
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    registry_schema_version: "production_source_registry_v1",
    registry_hash: "a".repeat(64),
    source_sets_hash: "b".repeat(64),
    policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "c".repeat(64) }],
    eligibility_evaluation: eligible,
    collection_mode: "manual",
    access_method: "official_api",
    expected_cadence: "monthly",
    freshness_threshold: "90d",
    permitted_artifact_types: ["metadata"],
    retention_policy: "link_only",
    legal_restrictions: [],
    expected_outputs: ["evidence_reference"],
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2026-01-02T00:00:00.000Z"
  });

  const h1 = createCollectionPlanHash(plan);
  const h2 = createCollectionPlanHash(plan);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});
