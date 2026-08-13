import test from "node:test";
import assert from "node:assert/strict";
import type { ExplanationEvidenceItem } from "../../src/lib/intelligence/explanation-contract";
import type { ExternalSignal } from "../../src/lib/external-intelligence/contracts/external-signal";
import { explanationEvidenceItemToCandidateV1, externalSignalToCandidateV1 } from "../../src/lib/intelligence/retrieval/evidence-adapters-v1";
import { rankEvidenceCandidatesV1 } from "../../src/lib/intelligence/retrieval/evidence-ranking-v1";

const NOW = "2026-08-13T00:00:00.000Z";

test("ExplanationEvidenceItem maps conservatively and keeps provenanceComplete=false", () => {
  const item: ExplanationEvidenceItem = {
    id: "ev-1",
    label: "Sessions change",
    source: "internal",
    kind: "metric",
    details: { delta: -10 }
  };
  const c = explanationEvidenceItemToCandidateV1(item);
  assert.equal(c.id, "ev-1");
  assert.equal(c.provenance.provenanceComplete, false);
  assert.equal(c.provenance.authority, "first_party");
  assert.equal(c.provenance.directness, "direct");
});

test("ExternalSignal maps official to authority=official; rumor implies contradiction risk high", () => {
  const signal: ExternalSignal = {
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
    signal_type: "rumor",
    signal_classification: "rumor",
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
    normalized_statement: "A rumor exists",
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
    access_classification: "public" as any
  };

  const c = externalSignalToCandidateV1(signal);
  assert.equal(c.provenance.authority, "unknown");
  assert.equal(c.provenance.contradictionRisk, "high");
});

test("Missing provenance cannot outrank official complete evidence when ranked", () => {
  const official = {
    id: "off",
    label: "Official",
    summary: "Official statement",
    provenance: {
      authority: "official" as const,
      sourceKey: "official",
      provenanceComplete: true,
      independentCorroborationCount: 0,
      directness: "direct" as const,
      freshness: { asOf: NOW },
      contradictionRisk: "low" as const
    }
  };

  const item: ExplanationEvidenceItem = { id: "ev", label: "x", source: "unknown", kind: "event", details: {} };
  const missing = explanationEvidenceItemToCandidateV1(item);

  const ranked = rankEvidenceCandidatesV1({ candidates: [missing as any, official as any], nowIso: NOW });
  assert.equal(ranked[0].candidate.id, "off");
});

