import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CORRECTION_SCOPE_ITEMS,
  routeCorrectionToLearningCandidateV1,
  supportedCorrectionClasses,
  type ReviewedCorrectionEvidenceV1
} from "@/lib/intelligence/organizational-learning/correction-router-v1";
import {
  CONFLICTED,
  INFERRED,
  KNOWN,
  MAX_LEARNING_ARRAY_ITEMS,
  STALE,
  UNKNOWN
} from "@/lib/intelligence/organizational-learning/learning-object-v1";

const observedAt = "2026-09-13T20:00:00.000Z";
const reviewedAt = "2026-09-13T20:05:00.000Z";

function correction(
  overrides: Partial<ReviewedCorrectionEvidenceV1> = {}
): ReviewedCorrectionEvidenceV1 {
  return {
    correction_id: "c:1",
    correction_class: "FACT_CORRECTION",
    truth_state: KNOWN,
    scope: "COMPANY",
    title: "Correct account owner",
    content: "The reviewed account owner is Operations.",
    confidence: 1,
    observed_at: observedAt,
    evidence: [
      { evidence_id: "e:2", source_lineage_id: "source:2", observed_at: observedAt },
      { evidence_id: "e:1", source_lineage_id: "source:1", observed_at: observedAt }
    ],
    affected_scope: ["crm.account-owner", "executive-summary"],
    review: { reviewer_id: "reviewer:1", reviewed_at: reviewedAt, decision: "APPROVE" },
    ...overrides
  };
}

test("routes every supported reviewed correction to exactly one non-canonical candidate", () => {
  for (const correction_class of supportedCorrectionClasses) {
    const result = routeCorrectionToLearningCandidateV1(correction({ correction_class }));
    assert.equal(result.status, "CANDIDATE");
    if (result.status !== "CANDIDATE") assert.fail("expected candidate");
    assert.equal(result.reasonCode, "SUPPORTED_REVIEWED_CORRECTION");
    assert.equal(result.candidate.lifecycle_state, "CANDIDATE");
    assert.equal(result.candidate.kind, correction_class);
    assert.equal(result.canonicalPromotionRequiresReview, true);
  }
});

test("fails closed when correction review is missing or rejected", () => {
  assert.equal(routeCorrectionToLearningCandidateV1(correction({ review: null })).reasonCode, "UNREVIEWED_CORRECTION");
  assert.equal(
    routeCorrectionToLearningCandidateV1(correction({ review: { reviewer_id: "r:1", reviewed_at: reviewedAt, decision: "REJECT" } })).reasonCode,
    "REVIEW_REJECTED"
  );
});

test("fails closed for ambiguous and unsupported correction classes", () => {
  assert.equal(routeCorrectionToLearningCandidateV1(correction({ ambiguous: true })).reasonCode, "AMBIGUOUS_CORRECTION");
  assert.equal(routeCorrectionToLearningCandidateV1(correction({ correction_class: "MODEL_GUESS" })).reasonCode, "UNSUPPORTED_CORRECTION_CLASS");
});

test("requires source evidence and rejects duplicate lineage evidence", () => {
  assert.equal(routeCorrectionToLearningCandidateV1(correction({ evidence: [] })).reasonCode, "MISSING_EVIDENCE");
  const duplicate = { evidence_id: "e:1", source_lineage_id: "source:1", observed_at: observedAt };
  assert.equal(routeCorrectionToLearningCandidateV1(correction({ evidence: [duplicate, { ...duplicate }] })).reasonCode, "DUPLICATE_EVIDENCE");
});

test("does not create a second candidate for known correction or learning identity", () => {
  assert.equal(
    routeCorrectionToLearningCandidateV1(correction(), { existingCorrectionIds: ["c:1"] }).reasonCode,
    "DUPLICATE_CORRECTION"
  );
  assert.equal(
    routeCorrectionToLearningCandidateV1(correction(), { existingLearningIds: ["learning:correction:c:1"] }).reasonCode,
    "DUPLICATE_CORRECTION"
  );
});

test("preserves unsafe truth states by withholding rather than strengthening them", () => {
  const cases = [
    [UNKNOWN, "UNKNOWN_CORRECTION"],
    [STALE, "STALE_CORRECTION"],
    [CONFLICTED, "CONFLICTED_CORRECTION"]
  ] as const;
  for (const [truth_state, reason] of cases) {
    const result = routeCorrectionToLearningCandidateV1(correction({ truth_state }));
    assert.equal(result.status, "WITHHELD");
    assert.equal(result.reasonCode, reason);
    assert.equal(result.candidate, null);
  }
});

test("keeps supported inference explicit and evidence-bound", () => {
  const result = routeCorrectionToLearningCandidateV1(correction({ truth_state: INFERRED, confidence: 0.7 }));
  assert.equal(result.status, "CANDIDATE");
  if (result.status !== "CANDIDATE") assert.fail("expected candidate");
  assert.equal(result.candidate.truth_state, INFERRED);
  assert.equal(result.candidate.confidence, 0.7);
});

test("enforces bounded evidence, affected scope, text, and review chronology", () => {
  const tooMuchEvidence = Array.from({ length: MAX_LEARNING_ARRAY_ITEMS + 1 }, (_, index) => ({
    evidence_id: `e:${index}`,
    source_lineage_id: `source:${index}`,
    observed_at: observedAt
  }));
  assert.equal(routeCorrectionToLearningCandidateV1(correction({ evidence: tooMuchEvidence })).reasonCode, "INVALID_CORRECTION");
  assert.equal(
    routeCorrectionToLearningCandidateV1(correction({ affected_scope: Array.from({ length: MAX_CORRECTION_SCOPE_ITEMS + 1 }, (_, index) => `scope:${index}`) })).reasonCode,
    "INVALID_CORRECTION"
  );
  assert.equal(
    routeCorrectionToLearningCandidateV1(correction({ review: { reviewer_id: "r:1", reviewed_at: "2026-09-13T19:59:00.000Z", decision: "APPROVE" } })).reasonCode,
    "INVALID_CORRECTION"
  );
});

test("returns deterministic sorted projections without mutating input", () => {
  const input = correction({ affected_scope: ["z", "a", "z"] });
  const before = structuredClone(input);
  const first = routeCorrectionToLearningCandidateV1(input);
  const second = routeCorrectionToLearningCandidateV1({ ...input, evidence: [...input.evidence].reverse() });

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.sourceRefs, ["source:1:e:1", "source:2:e:2"]);
  assert.deepEqual(first.affectedScope, ["a", "z"]);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.sourceRefs));
  assert.ok(Object.isFrozen(first.affectedScope));
});

test("never promotes or persists a routed correction", () => {
  const result = routeCorrectionToLearningCandidateV1(correction());
  assert.equal(result.status, "CANDIDATE");
  if (result.status !== "CANDIDATE") assert.fail("expected candidate");
  assert.equal(result.candidate.lifecycle_state, "CANDIDATE");
  assert.equal(result.candidate.approval, null);
  assert.equal(result.candidate.supersession, null);
});
