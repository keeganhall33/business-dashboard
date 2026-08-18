import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalExternalFusionContextToCandidates,
  type CanonicalExternalFusionContextV1,
  type CanonicalExternalKnowledgeObjectV1
} from "@/lib/fusion-v1/production/adapters/external-knowledge";
import { computeFusionCandidateFingerprint } from "@/lib/fusion-v1/fingerprinting";
import type { ConfidenceAxes } from "@/lib/external-intelligence/contracts/confidence-axes";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

const NOW = "2026-08-18T00:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);
const HASH_F = "f".repeat(64);

function ref(object_type: VersionRef["object_type"], object_id: string, content_hash = HASH_A): VersionRef {
  return {
    object_type,
    object_id,
    version_id: "v1",
    content_hash,
    schema_version: `${object_type}_schema_v1`,
    policy_version: "policy_v1",
    created_at: "2026-08-17T00:00:00.000Z"
  };
}

function policyRef(): PolicyRef {
  return {
    policy_name: "external_fusion_context_policy",
    semantic_version: "v1.0",
    content_hash: HASH_F,
    effective_from: "2026-08-01",
    effective_until: null,
    approval_status: "approved",
    approved_by: "fixture",
    changed_at: null,
    change_reason: "Fixture policy for canonical external knowledge adapter tests."
  };
}

function confidence(overrides: Partial<ConfidenceAxes["overall"]> = {}): ConfidenceAxes {
  const findingRef = ref("finding", "finding-demand-shift", HASH_A);
  const axis: ConfidenceAxes["overall"] = {
    level: "likely",
    bounded_score: null,
    reasons: ["Synthesized from version-pinned findings with explicit mechanism."],
    blockers: [],
    supporting_reference_ids: [findingRef],
    contradicting_reference_ids: [],
    missing_evidence_ids: [],
    ...overrides
  };
  return {
    evidence: axis,
    interpretation: axis,
    business_relevance: axis,
    mechanism: axis,
    timing: axis,
    entity_resolution: axis,
    overall: axis
  };
}

function knowledgeObject(overrides: Partial<CanonicalExternalKnowledgeObjectV1> = {}): CanonicalExternalKnowledgeObjectV1 {
  return {
    kind: "finding",
    version_ref: ref("finding", "finding-demand-shift", HASH_A),
    lifecycle_status: "active",
    title: "Collector demand shift",
    summary: "Synthesized external finding indicates a near-term cultural demand shift.",
    business_domains: ["brand", "partnerships"],
    affected_entities: [{ entity_id: "entity:athlete-a", role: "subject", entity_type: "athlete" }],
    expected_business_mechanism: "Cultural attention may change which subject validation questions are worth asking.",
    missing_evidence: ["internal collector response"],
    contradiction_refs: [],
    confidence: confidence(),
    relevance_expires_at: "2026-09-18T00:00:00.000Z",
    value_potential_proxy: 0.52,
    information_gain_value: 0.74,
    strategic_fit: 0.82,
    licensing_ip_review_required: false,
    strategic_guardrail_violations: [],
    ...overrides
  };
}

function context(overrides: Partial<CanonicalExternalFusionContextV1> = {}): CanonicalExternalFusionContextV1 {
  const findingVersionRef = ref("finding", "finding-demand-shift", HASH_A);
  return {
    fusion_context_id: "fusion-context-external-knowledge-fixture",
    generated_at: "2026-08-17T00:00:00.000Z",
    context_window: { start: "2026-08-01T00:00:00.000Z", end: "2026-09-18T00:00:00.000Z" },
    domains: ["brand", "partnerships"],
    finding_version_refs: [findingVersionRef],
    hypothesis_version_refs: [],
    risk_version_refs: [],
    opportunity_version_refs: [],
    world_model_state_version_ref: ref("world_model_state", "world-model", HASH_B),
    contradiction_refs: [],
    missing_evidence_refs: [],
    confidence_summary: confidence(),
    freshness_summary: { status: "fresh", reasons: ["Context generated within active relevance window."] },
    licensing_constraints: { blocked: false, reasons: [] },
    strategic_fit_constraints: { blocked: false, guardrail_violations: [], reasons: [] },
    provenance_bundle: {
      explanation_version_refs: [ref("hypothesis", "hypothesis-mechanism", HASH_C)],
      input_version_refs: [findingVersionRef]
    },
    context_policy_version: policyRef(),
    content_hash: HASH_D,
    knowledge_objects: [knowledgeObject()],
    ...overrides
  };
}

test("canonical synthesized external knowledge becomes a deterministic Fusion candidate", () => {
  const out = canonicalExternalFusionContextToCandidates({ nowIso: NOW, context: context() });
  assert.equal(out.rejected.length, 0);
  assert.equal(out.candidates.length, 1);
  const candidate = out.candidates[0]!;
  assert.equal(candidate.candidate_type, "canonical_external_knowledge");
  assert.equal(candidate.source_engine, "external_knowledge_synthesis");
  assert.equal(candidate.linked_finding_id, "finding-demand-shift");
  assert.deepEqual(candidate.external_signals_used, []);
  assert.equal(candidate.proposed_action, null);
  assert.ok(candidate.supporting_evidence_fact_ids.some((item) => item.includes("finding:finding-demand-shift")));
  assert.equal(candidate.confidence.level, "likely");
  assert.equal(candidate.relevance_expires_at, "2026-09-18T00:00:00.000Z");

  const again = canonicalExternalFusionContextToCandidates({ nowIso: NOW, context: context() });
  assert.equal(candidate.candidate_id, again.candidates[0]!.candidate_id);
  assert.equal(computeFusionCandidateFingerprint(candidate), computeFusionCandidateFingerprint(again.candidates[0]!));
});

test("raw or unversioned external signals are rejected before Fusion", () => {
  const rawSignalObject = knowledgeObject({
    version_ref: ref("signal", "raw-signal", HASH_E),
    confidence: confidence({ supporting_reference_ids: [ref("signal", "raw-signal", HASH_E)] })
  });
  const rawContext = context({
    finding_version_refs: [],
    knowledge_objects: [rawSignalObject],
    provenance_bundle: { explanation_version_refs: [], input_version_refs: [ref("signal", "raw-signal", HASH_E)] }
  });

  const out = canonicalExternalFusionContextToCandidates({ nowIso: NOW, context: rawContext });
  assert.equal(out.candidates.length, 0);
  assert.ok(out.rejected.some((item) => item.reason.includes("raw_or_pre_synthesis_ref_not_allowed")));

  const unversioned = context({
    finding_version_refs: [{ ...ref("finding", "finding-demand-shift", HASH_A), content_hash: "" }],
    knowledge_objects: [knowledgeObject({ version_ref: { ...ref("finding", "finding-demand-shift", HASH_A), content_hash: "" } })]
  });
  const unversionedOut = canonicalExternalFusionContextToCandidates({ nowIso: NOW, context: unversioned });
  assert.equal(unversionedOut.candidates.length, 0);
  assert.ok(unversionedOut.rejected.some((item) => item.reason.includes("invalid_version_ref")));
});

test("freshness licensing and provenance gates fail closed", () => {
  const stale = canonicalExternalFusionContextToCandidates({
    nowIso: NOW,
    context: context({ freshness_summary: { status: "stale", reasons: ["Expired synthesis context."] } })
  });
  assert.equal(stale.candidates.length, 0);
  assert.deepEqual(stale.rejected, [{ id: "fusion-context-external-knowledge-fixture", reason: "stale_fusion_context" }]);

  const expiredObject = canonicalExternalFusionContextToCandidates({
    nowIso: NOW,
    context: context({ knowledge_objects: [knowledgeObject({ relevance_expires_at: "2026-08-01T00:00:00.000Z" })] })
  });
  assert.equal(expiredObject.candidates.length, 0);
  assert.deepEqual(expiredObject.rejected, [{ id: "finding-demand-shift", reason: "expired_relevance" }]);

  const licensing = canonicalExternalFusionContextToCandidates({
    nowIso: NOW,
    context: context({ licensing_constraints: { blocked: true, reasons: ["licensed feed cannot be used downstream."] } })
  });
  assert.equal(licensing.candidates.length, 0);
  assert.deepEqual(licensing.rejected, [{ id: "fusion-context-external-knowledge-fixture", reason: "blocked_by_licensing_constraints" }]);

  const missingFromContext = canonicalExternalFusionContextToCandidates({
    nowIso: NOW,
    context: context({ finding_version_refs: [] })
  });
  assert.equal(missingFromContext.candidates.length, 0);
  assert.deepEqual(missingFromContext.rejected, [{ id: "finding-demand-shift", reason: "version_ref_missing_from_fusion_context" }]);
});

test("contradicted or unsupported synthesized knowledge does not enter Fusion", () => {
  const contradictionA = ref("contradiction", "contradiction-a", HASH_B);
  const contradictionB = ref("contradiction", "contradiction-b", HASH_C);
  const contradicted = canonicalExternalFusionContextToCandidates({
    nowIso: NOW,
    context: context({
      contradiction_refs: [contradictionA, contradictionB],
      knowledge_objects: [
        knowledgeObject({
          contradiction_refs: [contradictionA, contradictionB],
          confidence: confidence({ contradicting_reference_ids: [contradictionA, contradictionB] })
        })
      ]
    })
  });
  assert.equal(contradicted.candidates.length, 0);
  assert.deepEqual(contradicted.rejected, [{ id: "finding-demand-shift", reason: "too_many_contradictions" }]);

  const rumor = canonicalExternalFusionContextToCandidates({
    nowIso: NOW,
    context: context({ knowledge_objects: [knowledgeObject({ confidence: confidence({ level: "rumor" }) })] })
  });
  assert.equal(rumor.candidates.length, 0);
  assert.deepEqual(rumor.rejected, [{ id: "finding-demand-shift", reason: "insufficient_overall_confidence:rumor" }]);
});
