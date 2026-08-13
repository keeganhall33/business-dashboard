import test from "node:test";
import assert from "node:assert/strict";
import type { ExplanationEvidenceItem } from "../../src/lib/intelligence/explanation-contract";
import type { ExternalSignal } from "../../src/lib/external-intelligence/contracts/external-signal";
import {
  buildEvidenceCandidatesFromFixturesV1,
  buildRankedEvidenceFromFixturesV1
} from "../../src/lib/intelligence/retrieval/fixture-retrieval-lane-v1";

const NOW = "2026-08-13T00:00:00.000Z";

function minimalExternalSignal(partial: Partial<ExternalSignal>): ExternalSignal {
  // Minimal shape to satisfy typing for tests; values are conservative.
  return {
    signal_id: "sig-1",
    signal_schema_version: "v",
    interpretation_policy_version: "v",
    confidence_policy_version: "v",
    disposition_policy_version: "v",
    legal_policy_version: "v",
    entity_resolution_version: "v",
    source_registry_version: "v",
    signal_fingerprint: "f",
    created_at: NOW,
    updated_at: NOW,
    first_observed_at: NOW,
    last_observed_at: NOW,
    lifecycle_status: "active" as any,
    supersedes_signal_ids: [],
    superseded_by_signal_id: null,
    signal_type: "market_observation",
    signal_classification: "single_source",
    business_domains: [],
    affected_entities: [],
    affected_markets: [],
    geography: null,
    languages: [],
    source_ids: [],
    source_set_ids: [],
    evidence_reference_version_refs: [],
    claim_version_refs: [],
    event_version_refs: [],
    relationship_version_refs: [],
    trend_version_refs: [],
    normalized_statement: "Statement",
    observed_fact: "",
    inferred_interpretation: null,
    expected_business_mechanism: null,
    internal_business_relevance: null,
    strategic_fit: null,
    opportunity_relevance: null,
    risk_relevance: null,
    novelty: "unknown",
    urgency: "unknown",
    expiration: NOW,
    review_by: null,
    supporting_evidence: [],
    contradicting_evidence: [],
    missing_evidence: [],
    corroboration_count: 0,
    independent_source_count: 0,
    source_credibility_summary: "",
    signal_credibility: { level: "low", reasons: [] },
    confidence: { level: "unknown", reasons: [] } as any,
    uncertainty_reasons: [],
    what_would_strengthen: [],
    what_would_weaken: [],
    what_would_invalidate: [],
    disposition: "monitor" as any,
    disposition_reason_codes: [],
    escalation_eligibility: "blocked",
    fusion_eligibility: "blocked",
    monitoring_cadence: null,
    relevance_expires_at: NOW,
    archived_at: null,
    extraction_method: "deterministic",
    deterministic_rules_applied: [],
    llm_assistance_used: false,
    model_version: null,
    prompt_version: null,
    human_review_status: null,
    correction_history: [],
    access_classification: "public" as any,
    ...partial
  };
}

test("fixture retrieval lane returns deterministic candidates and ranking", () => {
  const explanation: ExplanationEvidenceItem = {
    id: "ev-1",
    label: "Sessions",
    source: "internal",
    kind: "metric",
    details: { value: 123 }
  };
  const signal = minimalExternalSignal({
    signal_id: "sig-2",
    signal_classification: "official",
    signal_type: "verified_event",
    normalized_statement: "Official statement"
  });

  const candidates = buildEvidenceCandidatesFromFixturesV1({ explanationEvidence: explanation, externalSignal: signal, nowIso: NOW });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].id, "ev-1");
  assert.equal(candidates[1].id, "sig-2");
  // Conservative unknowns preserved.
  assert.equal(candidates[0].provenance.provenanceComplete, false);

  const ranked = buildRankedEvidenceFromFixturesV1({ explanationEvidence: explanation, externalSignal: signal, nowIso: NOW });
  assert.equal(ranked.length, 2);
  // official should rank above first_party incomplete.
  assert.equal(ranked[0].candidate.id, "sig-2");
});

