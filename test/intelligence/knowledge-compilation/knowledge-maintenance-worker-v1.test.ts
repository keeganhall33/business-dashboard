import assert from "node:assert/strict";
import test from "node:test";

import {
  planKnowledgeMaintenanceV1,
  type KnowledgeMaintenanceChangeV1,
  type KnowledgeMaintenanceInputV1
} from "@/lib/intelligence/knowledge-compilation/knowledge-maintenance-worker-v1";
import {
  evaluateKnowledgeIntegrityV1,
  type KnowledgeIntegrityFindingV1
} from "@/lib/intelligence/knowledge-compilation/knowledge-integrity-v1";
import {
  createUnresolvedReferenceV1,
  resolveUnresolvedReferenceV1,
  type UnresolvedReferenceV1
} from "@/lib/intelligence/knowledge-compilation/unresolved-reference-v1";
import {
  createLearningCandidateV1,
  type LearningObjectV1
} from "@/lib/intelligence/organizational-learning/learning-object-v1";

const now = "2026-09-18T05:30:00Z";

function change(overrides: Partial<KnowledgeMaintenanceChangeV1> = {}): KnowledgeMaintenanceChangeV1 {
  return {
    change_id: "change:1",
    object_id: "decision:1",
    kind: "CANONICAL_CHANGE",
    truth_state: "KNOWN",
    freshness_state: "FRESH",
    material: true,
    updated_at: "2026-09-18T05:20:00Z",
    evidence_refs: ["evidence:change:1"],
    ...overrides
  };
}

function blockingFinding(): KnowledgeIntegrityFindingV1 {
  return evaluateKnowledgeIntegrityV1({
    observations: [
      {
        observation_id: "obs:conflict",
        finding_type: "CONTRADICTORY_FACT",
        affected_canonical_ids: ["decision:1"],
        evidence_refs: ["evidence:a", "evidence:b"],
        source_lineage_refs: ["source:a", "source:b"],
        truth_state: "CONFLICTED",
        freshness_state: "FRESH",
        business_impact: "ACTIVE_DECISION",
        time_state: "TIME_SENSITIVE",
        direct_evidence: true,
        first_seen: "2026-09-18T05:00:00Z",
        observed_at: "2026-09-18T05:25:00Z"
      }
    ]
  })[0];
}

function unresolvedReference(): UnresolvedReferenceV1 {
  return createUnresolvedReferenceV1({
    reference_id: "reference:person:1",
    reference_kind: "PERSON",
    display_label: "Unknown partner",
    provenance_refs: ["evidence:email:1"],
    source_context_id: "email:1",
    observed_at: "2026-09-18T05:10:00Z",
    created_at: "2026-09-18T05:10:00Z"
  });
}

function conflictedReference(): UnresolvedReferenceV1 {
  return resolveUnresolvedReferenceV1(unresolvedReference(), {
    candidates: [
      {
        entity_id: "person:a",
        match_evidence_refs: ["evidence:identity:a"],
        truth_state: "KNOWN",
        confidence: 0.8,
        direct_identity_evidence: true
      },
      {
        entity_id: "person:b",
        match_evidence_refs: ["evidence:identity:b"],
        truth_state: "KNOWN",
        confidence: 0.8,
        direct_identity_evidence: true
      }
    ],
    supplied_canonical_ids: ["person:a", "person:b"],
    policy: { allow_deterministic_resolution: true, minimum_confidence: 0.75 }
  });
}

function learningCandidate(truthState: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" = "INFERRED"): Readonly<LearningObjectV1> {
  return createLearningCandidateV1({
    learning_id: "learning:pricing:1",
    kind: "VALIDATED_LESSON",
    truth_state: truthState,
    scope: "COMPANY",
    title: "Pricing lesson candidate",
    content: "Observed pricing response should remain a reviewable candidate until evidence supports promotion.",
    confidence: 0.6,
    observed_at: "2026-09-18T05:15:00Z",
    evidence: [
      {
        evidence_id: "evidence:outcome:1",
        source_lineage_id: "outcome:1",
        observed_at: "2026-09-18T05:15:00Z"
      }
    ]
  });
}

function input(overrides: Partial<KnowledgeMaintenanceInputV1> = {}): KnowledgeMaintenanceInputV1 {
  const changes = overrides.changes ?? [];
  const findings = overrides.integrity_findings ?? [];
  const references = overrides.unresolved_references ?? [];
  const learning = overrides.learning_objects ?? [];
  const supplied = changes.length + findings.length + references.length + learning.length;
  return {
    cadence: "DAILY_DELTA",
    now,
    source_window: {
      snapshot_fingerprint: "snapshot:1",
      total_candidates: supplied,
      supplied_candidates: supplied,
      complete: true
    },
    previous_cursor: null,
    changes,
    integrity_findings: findings,
    unresolved_references: references,
    learning_objects: learning,
    ...overrides
  };
}

test("daily bounded delta emits deterministic work, review candidates, and cursor", () => {
  const result = planKnowledgeMaintenanceV1(
    input({
      changes: [change()],
      integrity_findings: [blockingFinding()],
      unresolved_references: [conflictedReference()],
      learning_objects: [learningCandidate()]
    })
  );

  assert.equal(result.status, "WORK_READY");
  assert.deepEqual(result.material_change_refs, ["change:1"]);
  assert.equal(result.integrity_finding_refs.length, 1);
  assert.deepEqual(result.unresolved_conflict_refs, ["reference:person:1"]);
  assert.equal(result.review_candidates.length, 3);
  assert.equal(result.review_candidates[0].truth_state, "CONFLICTED");
  assert.equal(result.review_candidates[1].truth_state, "CONFLICTED");
  assert.equal(result.review_candidates[2].source_type, "LEARNING_OBJECT");
  assert.equal(result.cursor?.sequence, 1);
  assert.equal(result.cursor?.last_processed_updated_at, "2026-09-18T05:25:00Z");
  assert.match(result.cursor?.cursor_fingerprint ?? "", /^fnv1a:[0-9a-f]{8}$/);
});

test("no material change stays quiet and is idempotent for identical bounded input", () => {
  const noChangeInput = input({ changes: [change({ material: false })] });
  const first = planKnowledgeMaintenanceV1(noChangeInput);
  const second = planKnowledgeMaintenanceV1(noChangeInput);

  assert.deepEqual(first, second);
  assert.equal(first.status, "NO_MATERIAL_CHANGE");
  assert.equal(first.no_material_change_reason, "NO_MATERIAL_CHANGE");
  assert.deepEqual(first.review_candidates, []);
  assert.deepEqual(first.integrity_finding_refs, []);
});

test("UNKNOWN and CONFLICTED remain explicit review states instead of becoming healthy", () => {
  const result = planKnowledgeMaintenanceV1(
    input({
      cadence: "WEEKLY_SYNTHESIS",
      unresolved_references: [unresolvedReference(), conflictedReference()],
      learning_objects: [learningCandidate("UNKNOWN")]
    })
  );

  assert.equal(result.status, "WORK_READY");
  assert.ok(result.review_candidates.some((candidate) => candidate.truth_state === "UNKNOWN"));
  assert.ok(result.review_candidates.some((candidate) => candidate.truth_state === "CONFLICTED"));
  assert.deepEqual(result.unresolved_conflict_refs, ["reference:person:1"]);
});

test("weekly and monthly cadences review stale or unresolved knowledge without fabricating urgency", () => {
  const staleLearning = learningCandidate("STALE");
  const weekly = planKnowledgeMaintenanceV1(
    input({
      cadence: "WEEKLY_SYNTHESIS",
      unresolved_references: [unresolvedReference()],
      learning_objects: [staleLearning]
    })
  );
  const monthly = planKnowledgeMaintenanceV1(
    input({
      cadence: "MONTHLY_REVIEW",
      unresolved_references: [unresolvedReference()],
      learning_objects: [staleLearning]
    })
  );

  assert.equal(weekly.status, "WORK_READY");
  assert.equal(monthly.status, "WORK_READY");
  assert.ok(weekly.review_candidates.every((candidate) => candidate.review_required));
  assert.ok(monthly.review_candidates.every((candidate) => candidate.review_required));
  assert.ok(weekly.review_candidates.some((candidate) => candidate.reason_code === "REFERENCE_UNRESOLVED"));
  assert.ok(monthly.review_candidates.some((candidate) => candidate.reason_code === "LEARNING_STALE_REVIEW"));
});

test("oversized source window trips the breaker without advancing a cursor or scanning everything", () => {
  const changes = Array.from({ length: 129 }, (_, index) =>
    change({
      change_id: `change:${index}`,
      object_id: `decision:${index}`,
      evidence_refs: [`evidence:${index}`]
    })
  );
  const result = planKnowledgeMaintenanceV1(input({ changes }));

  assert.equal(result.status, "BREAKER_TRIPPED");
  assert.equal(result.breaker_reason, "SOURCE_WINDOW_TOO_LARGE");
  assert.equal(result.cursor, null);
  assert.deepEqual(result.review_candidates, []);
});

test("incomplete or mismatched bounded windows fail closed through breaker state", () => {
  const incomplete = planKnowledgeMaintenanceV1(
    input({
      source_window: {
        snapshot_fingerprint: "snapshot:incomplete",
        total_candidates: 1,
        supplied_candidates: 1,
        complete: false
      },
      changes: [change()]
    })
  );
  assert.equal(incomplete.breaker_reason, "INCOMPLETE_SOURCE_WINDOW");

  const mismatch = planKnowledgeMaintenanceV1(
    input({
      source_window: {
        snapshot_fingerprint: "snapshot:mismatch",
        total_candidates: 2,
        supplied_candidates: 2,
        complete: true
      },
      changes: [change()]
    })
  );
  assert.equal(mismatch.breaker_reason, "SOURCE_WINDOW_MISMATCH");
});

test("malformed or cross-cadence cursor is rejected rather than silently resumed", () => {
  const first = planKnowledgeMaintenanceV1(input({ changes: [change()] }));
  assert.ok(first.cursor);

  assert.throws(
    () =>
      planKnowledgeMaintenanceV1(
        input({
          previous_cursor: { ...first.cursor!, cursor_fingerprint: "fnv1a:deadbeef" },
          changes: []
        })
      ),
    /CURSOR_FINGERPRINT_INVALID/
  );

  assert.throws(
    () =>
      planKnowledgeMaintenanceV1(
        input({
          cadence: "MONTHLY_REVIEW",
          previous_cursor: first.cursor,
          changes: []
        })
      ),
    /CURSOR_CADENCE_MISMATCH/
  );
});

test("review ordering is deterministic regardless of source array order", () => {
  const conflict = blockingFinding();
  const reference = conflictedReference();
  const learning = learningCandidate("UNKNOWN");

  const forward = planKnowledgeMaintenanceV1(
    input({
      cadence: "MONTHLY_REVIEW",
      integrity_findings: [conflict],
      unresolved_references: [reference],
      learning_objects: [learning]
    })
  );
  const reverse = planKnowledgeMaintenanceV1(
    input({
      cadence: "MONTHLY_REVIEW",
      integrity_findings: [conflict].reverse(),
      unresolved_references: [reference].reverse(),
      learning_objects: [learning].reverse()
    })
  );

  assert.deepEqual(forward.review_candidates, reverse.review_candidates);
  assert.deepEqual(forward.integrity_finding_refs, reverse.integrity_finding_refs);
});

test("planner never mutates supplied metadata and returned plan is deeply immutable", () => {
  const changes = [change()];
  const snapshot = structuredClone(changes);
  const result = planKnowledgeMaintenanceV1(input({ changes }));

  assert.deepEqual(changes, snapshot);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.material_change_refs));
  assert.ok(Object.isFrozen(result.review_candidates));
  assert.ok(result.cursor && Object.isFrozen(result.cursor));
});
