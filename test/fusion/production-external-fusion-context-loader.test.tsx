import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { loadExternalKnowledgeSynthesisCandidates } from "@/lib/fusion-v1/production/external-knowledge-synthesis-candidates";
import { loadLatestEligibleExternalFusionContexts, type ExternalFusionContextDbClient } from "@/lib/fusion-v1/production/external-fusion-context-loader";
import type { CanonicalExternalFusionContextV1, CanonicalExternalKnowledgeObjectV1 } from "@/lib/fusion-v1/production/adapters/external-knowledge";
import type { ConfidenceAxes } from "@/lib/external-intelligence/contracts/confidence-axes";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

const NOW = "2026-08-18T00:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
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
    change_reason: "Fixture policy for production external context loader tests."
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

function clientFor(data: unknown[] | null, error: { message?: string; code?: string } | null = null): ExternalFusionContextDbClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data, error })
          })
        })
      })
    })
  };
}

test("production loader reads latest eligible persisted canonical FusionContext", async () => {
  const ctx = context();
  const loaded = await loadLatestEligibleExternalFusionContexts({
    nowIso: NOW,
    client: clientFor([{ fusion_context_id: ctx.fusion_context_id, content_hash: ctx.content_hash, generated_at: ctx.generated_at, lifecycle_status: "active", payload_json: ctx }])
  });
  assert.equal(loaded.unavailable, false);
  assert.equal(loaded.contexts.length, 1);

  const out = await loadExternalKnowledgeSynthesisCandidates({
    nowIso: NOW,
    external_fusion_context_loader: async () => loaded
  });
  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0]!.source_engine, "external_knowledge_synthesis");
  assert.equal(out.candidates[0]!.linked_finding_id, "finding-demand-shift");
  assert.equal(out.candidates[0]!.external_signals_used.length, 0);
  assert.equal(out.sources_empty.length, 0);
});

test("raw or pre-synthesis persisted payloads cannot enter through loader", async () => {
  const raw = { fusion_context_id: "raw", generated_at: NOW, content_hash: HASH_D, raw_signals: [ref("signal", "sig-1")] };
  const loaded = await loadLatestEligibleExternalFusionContexts({
    nowIso: NOW,
    client: clientFor([{ fusion_context_id: "raw", content_hash: HASH_D, generated_at: NOW, lifecycle_status: "active", payload_json: raw }])
  });
  assert.equal(loaded.contexts.length, 0);
  assert.deepEqual(loaded.skipped, [{ id: "raw", reason: "invalid_or_raw_fusion_context_payload" }]);
});

test("no-context and missing store behavior is explicit and safe", async () => {
  const empty = await loadLatestEligibleExternalFusionContexts({ nowIso: NOW, client: clientFor([]) });
  assert.equal(empty.contexts.length, 0);
  assert.equal(empty.unavailable, false);

  const unavailable = await loadExternalKnowledgeSynthesisCandidates({
    nowIso: NOW,
    external_fusion_context_loader: async () => ({
      contexts: [],
      unavailable: true,
      source: "external_knowledge_synthesis",
      inspected_at: NOW,
      skipped: [{ id: "external_fusion_contexts_v1", reason: "canonical_external_fusion_context_store_unavailable" }]
    })
  });
  assert.equal(unavailable.candidates.length, 0);
  assert.ok(unavailable.sources_empty.includes("external_knowledge_synthesis"));
  assert.ok(unavailable.sources_skipped.some((item) => item.reason === "canonical_external_fusion_context_store_unavailable"));
});

test("stale and blocked persisted contexts stay out of production Fusion", async () => {
  const stale = await loadExternalKnowledgeSynthesisCandidates({
    nowIso: NOW,
    external_fusion_context_loader: async () => ({
      contexts: [context({ freshness_summary: { status: "stale", reasons: ["Expired synthesis context."] } })],
      unavailable: false,
      source: "external_knowledge_synthesis",
      inspected_at: NOW,
      skipped: []
    })
  });
  assert.equal(stale.candidates.length, 0);
  assert.ok(stale.sources_stale.includes("external_knowledge_synthesis:fusion-context-external-knowledge-fixture"));

  const blocked = await loadExternalKnowledgeSynthesisCandidates({
    nowIso: NOW,
    external_fusion_context_loader: async () => ({
      contexts: [context({ licensing_constraints: { blocked: true, reasons: ["licensed feed cannot be used downstream."] } })],
      unavailable: false,
      source: "external_knowledge_synthesis",
      inspected_at: NOW,
      skipped: []
    })
  });
  assert.equal(blocked.candidates.length, 0);
  assert.ok(blocked.sources_skipped.some((item) => item.reason === "blocked_by_licensing_constraints"));
});

test("scheduled production Fusion uses automatic loader path", () => {
  const source = fs.readFileSync("src/lib/scheduler/fusionDailyDecisionV1.ts", "utf8");
  assert.match(source, /loadProductionFusionCandidates\(\{\s*nowIso,\s*strategic_constraints_blocked_domains: constraints\.blocked_domains\s*\}\)/);
  assert.doesNotMatch(source, /external_fusion_contexts/);
});
