import test from "node:test";
import assert from "node:assert/strict";

import { guardExternalCollectorExecutionV1 } from "@/lib/external-intelligence/orchestration/external-collector-guard";

test("external collector guard: fails closed in B3 and includes stable blocker codes", () => {
  const res = guardExternalCollectorExecutionV1({
    job_id: "job1",
    category: "external_collection",
    environment: "production",
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    schedule_id: "sched1",
    schedule_enabled: false,
    collection_plan_id: "plan1",
    collection_plan_json: null,
    requested_mode: "automated",
    adapter_source_id: "economics.fred",
    adapter_operational: false,
    governing_registry_hash: "mismatch",
    governing_source_sets_hash: "mismatch",
    governing_policy_refs: [],
    credentials_available: false,
    retention_supported: false,
    legal_review_current: false,
    terms_approved: false,
    environment_approved_for_collection: false,
    input_fingerprint: "fp",
    schedule_identity: "sid"
  });

  assert.equal(res.ok, false);
  const codes = (res as unknown as { blocker_codes: string[] }).blocker_codes;
  assert.ok(codes.includes("external_collection_not_activated"));
  assert.ok(codes.includes("schedule_not_enabled"));
  assert.ok(codes.includes("collection_plan_missing"));
  assert.ok(codes.includes("environment_not_approved"));
});
