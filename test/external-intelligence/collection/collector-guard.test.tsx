import test from "node:test";
import assert from "node:assert/strict";

import { guardCollectionExecution } from "@/lib/external-intelligence/collection/guard";

test("collector guard: dry-run validation rejects ineligible-now plans", () => {
  const req = {
    source_id: "economics.fred",
    registry_version: "v1.0.0",
    registry_hash: "a".repeat(64),
    source_sets_hash: "b".repeat(64),
    eligibility_fingerprint: "c".repeat(64),
    plan: {
      collection_plan_id: "plan_12345678",
      source_id: "economics.fred",
      source_config_version: "v1.0.0",
      registry_schema_version: "production_source_registry_v1",
      registry_hash: "a".repeat(64),
      source_sets_hash: "b".repeat(64),
      policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "d".repeat(64) }],
      eligibility_evaluation: {
        allowed: false,
        allowed_now: false,
        currently_allowed_modes: [],
        potentially_permitted_modes: ["metadata_only"],
        pathway_requirements_by_mode: { automated: [], manual: [], metadata_only: ["legal_review_current"] },
        universal_blockers: ["source_disabled"],
        mode_specific_blockers: { automated: [], manual: [], metadata_only: [] },
        blocking_reasons: ["source_disabled"],
        warnings: [],
        review_required: true,
        review_by: null,
        lifecycle_status: "trial",
        implementation_status: "unimplemented",
        access_status: "unknown",
        governing_source_config_version: "v1.0.0",
        governing_registry_version: "v1.0.0",
        governing_registry_hash: "a".repeat(64),
        governing_source_sets_hash: "b".repeat(64),
        governing_policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "d".repeat(64) }],
        evaluation_fingerprint: "c".repeat(64)
      },
      collection_mode: "metadata_only",
      access_method: "official_api",
      expected_cadence: "monthly",
      freshness_threshold: "90d",
      permitted_artifact_types: ["time_series_observations"],
      retention_policy: "link_only",
      legal_restrictions: [],
      expected_outputs: ["evidence_reference"],
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2099-01-02T00:00:00.000Z"
    },
    requested_time_window: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-02T00:00:00.000Z" },
    cursor: null,
    environment: "production",
    dry_run: true,
    maximum_artifact_count: 100
  };

  const deps = {
    source: { source_id: "economics.fred", source_config_version: "v1.0.0", authentication_required: false },
    eligibility: req.plan.eligibility_evaluation,
    policy_refs: req.plan.policy_refs,
    adapter_source_id: "economics.fred",
    adapter_operational: false,
    credentials_available: false,
    retention_capable: true,
    environment_approved_for_collection: false
  };

  const res = guardCollectionExecution({
    req: req as unknown as Parameters<typeof guardCollectionExecution>[0]["req"],
    deps: deps as unknown as Parameters<typeof guardCollectionExecution>[0]["deps"]
  });
  assert.equal(res.ok, false);
  // Guard is fail-closed: invalid plan rejects before eligibility evaluation.
  assert.equal(res.error?.code, "PLAN_INVALID");
});
