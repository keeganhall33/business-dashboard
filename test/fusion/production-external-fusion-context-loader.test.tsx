import test from "node:test";
import assert from "node:assert/strict";

import { loadLatestCanonicalExternalFusionContexts } from "@/lib/fusion-v1/production/external-fusion-context-loader";
import { loadProductionFusionCandidates } from "@/lib/fusion-v1/production/candidate-loaders";
import type { CanonicalExternalFusionContextV1, CanonicalExternalKnowledgeObjectV1 } from "@/lib/fusion-v1/production/adapters/external-knowledge";
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
    change_reason: "Fixture policy for persisted FusionContext tests."
  };
}

function confidence(overrides: Partial<ConfidenceAxes["overall"]> = {}): ConfidenceAxes {
  const findingRef = ref("finding", "finding-demand-shift", HASH_A);
  const axis: ConfidenceAxes["overall"] = {
    level: "likely",
    bounded_score: null,
    reasons: ["Synthesized from version-pinned knowledge."],
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
    title: "External demand shift",
    summary: "Canonical synthesized context indicates a near-term demand shift.",
    business_domains: ["brand", "partnerships"],
    affected_entities: [{ entity_id: "entity:athlete-a", role: "subject", entity_type: "athlete" }],
    expected_business_mechanism: "External attention may change which validation questions are worth asking.",
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
    fusion_context_id: "fusion-context-persisted",
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
    freshness_summary: { status: "fresh", reasons: ["Context is within active relevance window."] },
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

function clientWithRows(rows: unknown[], error: unknown = null) {
  const chain = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    limit: async () => ({ data: rows, error })
  };
  return { from: () => chain };
}

test("persisted eligible canonical external FusionContext loads from storage", async () => {
  const loaded = await loadLatestCanonicalExternalFusionContexts({
    client: clientWithRows([{ lifecycle_status: "active", payload: context() }])
  });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]!.fusion_context_id, "fusion-context-persisted");
});

test("raw and pre-synthesis storage payloads cannot enter through the loader", async () => {
  const rawSignal = {
    signal_id: "raw-signal",
    signal_type: "verified_event",
    source_url_or_reference: "https://example.test/raw"
  };
  const loaded = await loadLatestCanonicalExternalFusionContexts({
    client: clientWithRows([
      { lifecycle_status: "active", payload: rawSignal },
      { lifecycle_status: "active", payload: { ...context(), finding_version_refs: [{ ...ref("signal", "raw-signal", HASH_E) }] } },
      { lifecycle_status: "active", payload: { ...context(), knowledge_objects: [{ version_ref: ref("signal", "raw-object", HASH_E) }] } },
      { lifecycle_status: "expired", payload: context({ fusion_context_id: "expired-context" }) },
      { lifecycle_status: "active", payload: context() }
    ])
  });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]!.fusion_context_id, "fusion-context-persisted");
});

test("missing persisted FusionContext storage is safe empty", async () => {
  const loaded = await loadLatestCanonicalExternalFusionContexts({
    client: clientWithRows([], { code: "PGRST205", message: "Could not find public.external_fusion_contexts_v1" })
  });
  assert.deepEqual(loaded, []);
});

test("production candidate loader automatically consumes persisted canonical external context", async () => {
  let externalLoaderCalled = false;
  const loaded = await loadProductionFusionCandidates({
    nowIso: NOW,
    strategic_constraints_blocked_domains: [],
    loaders: {
      dashboardSnapshots: async () => [],
      activeOpportunities: async () => [],
      trafficQualityMismatchChain: async () => null,
      externalFusionContexts: async () => {
        externalLoaderCalled = true;
        return [context()];
      }
    }
  });

  assert.equal(externalLoaderCalled, true);
  assert.equal(loaded.sources_inspected.includes("external_knowledge_synthesis"), true);
  assert.equal(loaded.sources_empty.includes("external_knowledge_synthesis"), false);
  assert.equal(loaded.candidates.length, 1);
  assert.equal(loaded.candidates[0]!.source_engine, "external_knowledge_synthesis");
  assert.equal(loaded.candidate_meta_by_id[loaded.candidates[0]!.candidate_id]!.source, "external_knowledge_synthesis:fusion-context-persisted");
});

test("production candidate loader reports no-context and stale or blocked context without fabricating candidates", async () => {
  const empty = await loadProductionFusionCandidates({
    nowIso: NOW,
    strategic_constraints_blocked_domains: [],
    loaders: {
      dashboardSnapshots: async () => [],
      activeOpportunities: async () => [],
      trafficQualityMismatchChain: async () => null,
      externalFusionContexts: async () => []
    }
  });
  assert.equal(empty.candidates.length, 0);
  assert.equal(empty.sources_empty.includes("external_knowledge_synthesis"), true);

  const stale = await loadProductionFusionCandidates({
    nowIso: NOW,
    strategic_constraints_blocked_domains: [],
    loaders: {
      dashboardSnapshots: async () => [],
      activeOpportunities: async () => [],
      trafficQualityMismatchChain: async () => null,
      externalFusionContexts: async () => [
        context({ freshness_summary: { status: "stale", reasons: ["Expired context."] } }),
        context({ fusion_context_id: "blocked-context", licensing_constraints: { blocked: true, reasons: ["IP block"] } })
      ]
    }
  });
  assert.equal(stale.candidates.length, 0);
  assert.ok(stale.sources_skipped.some((item) => item.reason.includes("stale_fusion_context")));
  assert.ok(stale.sources_skipped.some((item) => item.reason.includes("blocked_by_licensing_constraints")));
});
