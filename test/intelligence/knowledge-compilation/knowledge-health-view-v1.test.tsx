import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeHealthViewV1 } from "@/lib/intelligence/knowledge-compilation/knowledge-health-view-v1";
import type { KnowledgeIntegrityFindingV1 } from "@/lib/intelligence/knowledge-compilation/knowledge-integrity-v1";
import type { UnresolvedReferenceV1 } from "@/lib/intelligence/knowledge-compilation/unresolved-reference-v1";
import type { LearningObjectV1 } from "@/lib/intelligence/organizational-learning/learning-object-v1";

function finding(overrides: Partial<KnowledgeIntegrityFindingV1> = {}): KnowledgeIntegrityFindingV1 {
  return {
    contract_version: "KNOWLEDGE_INTEGRITY_V1",
    finding_id: "integrity:1",
    finding_type: "STALE_CANONICAL_OBJECT",
    severity: "REVIEW",
    affected_canonical_ids: ["person:1"],
    evidence_refs: ["evidence:1"],
    source_lineage_refs: ["source:1"],
    truth_state: "STALE",
    freshness_state: "STALE",
    business_impact: "NONE",
    time_state: "NOT_TIME_SENSITIVE",
    direct_evidence: true,
    reason_code: "CANONICAL_OBJECT_EXPLICITLY_STALE",
    recommended_next_step: "VERIFY_FRESHNESS",
    review_required: false,
    first_seen: "2026-09-13T00:00:00Z",
    observed_at: "2026-09-13T01:00:00Z",
    ...overrides
  };
}

function reference(overrides: Partial<UnresolvedReferenceV1> = {}): UnresolvedReferenceV1 {
  return {
    contract_version: "UNRESOLVED_REFERENCE_V1",
    reference_id: "reference:1",
    reference_kind: "PERSON",
    display_label: "Supported person label",
    normalized_label: "supported person label",
    provenance_refs: ["source:1"],
    source_context_id: "context:1",
    observed_at: "2026-09-13T00:00:00Z",
    effective_at: null,
    affected_canonical_object_ids: [],
    candidates: [],
    status: "UNRESOLVED",
    truth_state: "UNKNOWN",
    confidence: null,
    resolved_canonical_id: null,
    resolution_reason: null,
    resolution_evidence_refs: [],
    created_at: "2026-09-13T00:00:00Z",
    ...overrides
  };
}

function learning(): LearningObjectV1 {
  return {
    contract_version: "LEARNING_OBJECT_V1",
    learning_id: "learning:1",
    version: 1,
    kind: "VALIDATED_LESSON",
    lifecycle_state: "CANDIDATE",
    truth_state: "KNOWN",
    scope: "COMPANY",
    title: "Evidence-backed lesson",
    content: "Review before canonical promotion.",
    confidence: 1,
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
    evidence: [{ evidence_id: "e:1", source_lineage_id: "s:1", observed_at: "2026-09-13T00:00:00Z" }],
    approval: null,
    supersession: null
  };
}

function view(findings: readonly KnowledgeIntegrityFindingV1[] = [], unresolved: readonly UnresolvedReferenceV1[] = [], learningItems: readonly LearningObjectV1[] = []) {
  return buildKnowledgeHealthViewV1({ findings, unresolved_references: unresolved, learning_items: learningItems });
}

test("blocking conflict drives BLOCKED health", () => {
  const result = view([finding({ finding_type: "CONTRADICTORY_FACT", severity: "BLOCKING", truth_state: "CONFLICTED", business_impact: "ACTIVE_DECISION" })]);
  assert.equal(result.health, "BLOCKED");
  assert.equal(result.summary.material_conflicts, 1);
});

test("ordinary stale housekeeping does not falsely block", () => {
  const result = view([finding()]);
  assert.equal(result.health, "NEEDS_ATTENTION");
  assert.equal(result.summary.stale_decision_knowledge, 0);
});

test("ambiguous identity is visible and review-required", () => {
  const result = view([], [reference({ status: "REVIEW_REQUIRED", truth_state: "CONFLICTED", candidates: [
    { entity_id: "person:1", match_evidence_refs: ["e:1"], truth_state: "KNOWN", confidence: 0.8, direct_identity_evidence: true },
    { entity_id: "person:2", match_evidence_refs: ["e:2"], truth_state: "KNOWN", confidence: 0.8, direct_identity_evidence: true }
  ] })]);
  assert.equal(result.queue[0].issue_type, "Ambiguous identity");
  assert.equal(result.queue[0].review_required, true);
});

test("active decision risk ranks above low-impact housekeeping", () => {
  const low = finding({ finding_id: "low", finding_type: "ORPHANED_RELATIONSHIP", severity: "REVIEW", business_impact: "NONE" });
  const high = finding({ finding_id: "high", finding_type: "CONTRADICTORY_FACT", severity: "BLOCKING", truth_state: "CONFLICTED", business_impact: "ACTIVE_DECISION" });
  assert.equal(view([low, high]).queue[0].id, "high");
});

test("UNKNOWN coverage cannot render HEALTHY", () => {
  const result = buildKnowledgeHealthViewV1({ findings: null, unresolved_references: [], learning_items: [] });
  assert.equal(result.health, "UNKNOWN");
  assert.equal(result.coverage, "INCOMPLETE");
});

test("sensitive raw payload cannot reach the view model", () => {
  const unsafe = { ...finding(), raw_payload: "secret body" } as KnowledgeIntegrityFindingV1;
  const serialized = JSON.stringify(view([unsafe]));
  assert.doesNotMatch(serialized, /secret body|raw_payload/);
});

test("ordering is deterministic independent of source order", () => {
  const a = finding({ finding_id: "a", finding_type: "MISSING_PROVENANCE", severity: "IMPORTANT" });
  const b = finding({ finding_id: "b", finding_type: "UNKNOWN_OWNER", severity: "REVIEW" });
  assert.deepEqual(view([a, b]).queue, view([b, a]).queue);
});

test("read-only mode never implies a repair occurred", () => {
  const result = view([finding()]);
  assert.equal(result.read_only, true);
  assert.equal(result.queue[0].action_available, false);
  assert.equal("repair_succeeded" in result.queue[0], false);
});

test("empty supplied findings render truthful no-detected-issues state", () => {
  const result = view();
  assert.equal(result.health, "HEALTHY");
  assert.equal(result.no_detected_issues, true);
  assert.match(result.status_message, /not proof/i);
});

test("supported drill target is preserved while unsupported target is omitted", () => {
  const base = finding({ affected_canonical_ids: ["person:1"] });
  const supported = buildKnowledgeHealthViewV1({
    findings: [base], unresolved_references: [], learning_items: [],
    drill_targets: [{ canonical_id: "person:1", kind: "PERSON" }]
  });
  assert.equal(supported.queue[0].detail_href, "/relationships/people/person%3A1");
  assert.equal(view([base]).queue[0].detail_href, null);
});

test("evidence-backed learning candidate is visible for governed review", () => {
  const result = view([], [], [learning()]);
  assert.equal(result.summary.learning_items_awaiting_review, 1);
  assert.equal(result.queue[0].next_step, "REVIEW_LEARNING");
});

test("queue output is bounded and immutable", () => {
  const findings = Array.from({ length: 40 }, (_, index) => finding({ finding_id: `finding:${index}` }));
  const result = view(findings);
  assert.equal(result.queue.length, 24);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.queue));
});
