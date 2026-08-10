import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createClaimVersionContentHashV2 } from "@/lib/external-intelligence/hashing/fingerprint-v2";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql");
const V2 = path.join(process.cwd(), "supabase/migrations/20260810_external_intelligence_fingerprint_v2.sql");
const V2_CLAIM_SEMANTIC = path.join(process.cwd(), "supabase/migrations/20260810195500_external_intelligence_claim_hash_v2_semantic.sql");

function jsonLiteral(obj: unknown): string {
  return JSON.stringify(obj).replace(/'/g, "''");
}

test("claim v2 hash: retrieved_at excluded (T1 == T2)", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);
  db.file(V2);
  db.file(V2_CLAIM_SEMANTIC);

  const base = {
    claim_id: "cl_53c94cd6d361b5fd871e27e8",
    claim_fingerprint: "1c5c380c366b77c88bd050b8be0214f0cd4d7479197a66ecd467162f3a012963",
    evidence_reference_id: "ev_d7ff657c5f2040c6cf6f9b59",
    subject: { entity_id: "provisional:organization:855052d8c715418165b6cb72" },
    predicate: "operates_event_program",
    object: { kind: "literal", value: "tour", unit: null, value_type: "string", language: null },
    event_time: null,
    announcement_time: null,
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    contradiction_state: "none",
    correction_state: "none",
    relevance_window: { start: null, end: null },
    schema_version: "claim_v2",
    interpretation_policy_version: "program_surface_v1.policy.operates_event_program"
  };

  const c1 = { ...base, retrieved_at: "2026-08-10T00:00:00.000Z" };
  const c2 = { ...base, retrieved_at: "2026-08-10T23:59:59.000Z" };

  const h1 = createClaimVersionContentHashV2({
    claim_id: c1.claim_id,
    claim_fingerprint: c1.claim_fingerprint,
    evidence_reference_id: c1.evidence_reference_id,
    subject_entity_id: c1.subject.entity_id,
    predicate: c1.predicate,
    object_kind: "literal",
    object_entity_id: null,
    object_literal_value: c1.object.value,
    object_literal_unit: null,
    object_literal_value_type: c1.object.value_type,
    object_literal_language: null,
    event_time: null,
    announcement_time: null,
    observed_vs_inferred: c1.observed_vs_inferred,
    verification_state: c1.verification_state,
    extraction_confidence_level: c1.extraction_confidence.level,
    extraction_confidence_reasons: c1.extraction_confidence.reasons,
    contradiction_state: c1.contradiction_state,
    correction_state: c1.correction_state,
    relevance_window_start: null,
    relevance_window_end: null,
    schema_version: c1.schema_version,
    interpretation_policy_version: c1.interpretation_policy_version
  });

  const h2 = createClaimVersionContentHashV2({
    claim_id: c2.claim_id,
    claim_fingerprint: c2.claim_fingerprint,
    evidence_reference_id: c2.evidence_reference_id,
    subject_entity_id: c2.subject.entity_id,
    predicate: c2.predicate,
    object_kind: "literal",
    object_entity_id: null,
    object_literal_value: c2.object.value,
    object_literal_unit: null,
    object_literal_value_type: c2.object.value_type,
    object_literal_language: null,
    event_time: null,
    announcement_time: null,
    observed_vs_inferred: c2.observed_vs_inferred,
    verification_state: c2.verification_state,
    extraction_confidence_level: c2.extraction_confidence.level,
    extraction_confidence_reasons: c2.extraction_confidence.reasons,
    contradiction_state: c2.contradiction_state,
    correction_state: c2.correction_state,
    relevance_window_start: null,
    relevance_window_end: null,
    schema_version: c2.schema_version,
    interpretation_policy_version: c2.interpretation_policy_version
  });

  assert.equal(h1, h2);

  const db1 = db.psql(`select public.ei_compute_claim_version_content_hash_v2('${jsonLiteral(c1)}'::jsonb);`);
  const db2 = db.psql(`select public.ei_compute_claim_version_content_hash_v2('${jsonLiteral(c2)}'::jsonb);`);
  assert.equal(db1, db2);
  assert.equal(db1, h1);
});

test("claim v2 hash: semantic change flips hash", () => {
  const a = createClaimVersionContentHashV2({
    claim_id: "cl_53c94cd6d361b5fd871e27e8",
    claim_fingerprint: "1c5c380c366b77c88bd050b8be0214f0cd4d7479197a66ecd467162f3a012963",
    evidence_reference_id: "ev_d7ff657c5f2040c6cf6f9b59",
    subject_entity_id: "provisional:organization:855052d8c715418165b6cb72",
    predicate: "operates_event_program",
    object_kind: "literal",
    object_entity_id: null,
    object_literal_value: "tour",
    object_literal_unit: null,
    object_literal_value_type: "string",
    object_literal_language: null,
    event_time: null,
    announcement_time: null,
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence_level: "high",
    extraction_confidence_reasons: ["fixture"],
    contradiction_state: "none",
    correction_state: "none",
    relevance_window_start: null,
    relevance_window_end: null,
    schema_version: "claim_v2",
    interpretation_policy_version: "program_surface_v1.policy.operates_event_program"
  });

  const b = createClaimVersionContentHashV2({
    claim_id: "cl_53c94cd6d361b5fd871e27e8",
    claim_fingerprint: "1c5c380c366b77c88bd050b8be0214f0cd4d7479197a66ecd467162f3a012963",
    evidence_reference_id: "ev_d7ff657c5f2040c6cf6f9b59",
    subject_entity_id: "provisional:organization:855052d8c715418165b6cb72",
    predicate: "operates_event_program",
    object_kind: "literal",
    object_entity_id: null,
    object_literal_value: "league", // semantic change
    object_literal_unit: null,
    object_literal_value_type: "string",
    object_literal_language: null,
    event_time: null,
    announcement_time: null,
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence_level: "high",
    extraction_confidence_reasons: ["fixture"],
    contradiction_state: "none",
    correction_state: "none",
    relevance_window_start: null,
    relevance_window_end: null,
    schema_version: "claim_v2",
    interpretation_policy_version: "program_surface_v1.policy.operates_event_program"
  });

  assert.notEqual(a, b);
});
