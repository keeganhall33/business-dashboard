import assert from "node:assert/strict";
import test from "node:test";

import {
  approveLearningCandidateV1,
  createLearningCandidateV1,
  promoteLearningToCanonicalV1,
  supersedeLearningV1,
  validateLearningObjectV1,
  type LearningObjectV1
} from "@/lib/intelligence/organizational-learning/learning-object-v1";

const t0 = "2026-09-18T08:00:00.000Z";
const t1 = "2026-09-18T08:01:00.000Z";
const t2 = "2026-09-18T08:02:00.000Z";
const t3 = "2026-09-18T08:03:00.000Z";

function canonicalDecision(): Readonly<LearningObjectV1> {
  const candidate = createLearningCandidateV1({
    learning_id: "learning:decision:1",
    kind: "STRATEGIC_DECISION",
    truth_state: "KNOWN",
    scope: "COMPANY",
    title: "Original strategy",
    content: "Use the reviewed original strategy until superseded.",
    confidence: 0.8,
    observed_at: t0,
    evidence: [{ evidence_id: "e:1", source_lineage_id: "source:1", observed_at: t0 }]
  });
  const approved = approveLearningCandidateV1(candidate as LearningObjectV1, {
    reviewer_id: "reviewer:1",
    reviewed_at: t1,
    decision: "APPROVE"
  });
  return promoteLearningToCanonicalV1(approved as LearningObjectV1, t2);
}

test("supersession preserves predecessor identity, successor identity, reason, and history", () => {
  const predecessor = canonicalDecision();
  const superseded = supersedeLearningV1(
    predecessor as LearningObjectV1,
    "learning:decision:2",
    "New reviewed evidence changed the strategy.",
    t3
  );

  assert.equal(superseded.learning_id, "learning:decision:1");
  assert.equal(superseded.lifecycle_state, "SUPERSEDED");
  assert.equal(superseded.supersession?.predecessor_id, "learning:decision:1");
  assert.equal(superseded.supersession?.successor_id, "learning:decision:2");
  assert.equal(superseded.supersession?.reason, "New reviewed evidence changed the strategy.");
  assert.equal(superseded.version, predecessor.version + 1);
  assert.deepEqual(superseded.evidence, predecessor.evidence);
  assert.ok(Object.isFrozen(superseded));
  assert.ok(Object.isFrozen(superseded.supersession));
});

test("self and circular supersession fail closed", () => {
  const predecessor = canonicalDecision();
  assert.throws(
    () => supersedeLearningV1(predecessor as LearningObjectV1, predecessor.learning_id, "self", t3),
    /SELF_SUPERSESSION/
  );
  assert.throws(
    () => supersedeLearningV1(predecessor as LearningObjectV1, "learning:decision:2", "cycle", t3, ["learning:decision:2"]),
    /CIRCULAR_SUPERSESSION/
  );
  assert.throws(
    () => supersedeLearningV1(predecessor as LearningObjectV1, "learning:decision:2", "duplicate chain", t3, ["a", "a"]),
    /CIRCULAR_SUPERSESSION/
  );
});

test("validator rejects an explicitly self-referential successor", () => {
  const predecessor = canonicalDecision();
  assert.throws(
    () => validateLearningObjectV1({
      ...predecessor,
      lifecycle_state: "SUPERSEDED",
      version: predecessor.version + 1,
      updated_at: t3,
      supersession: {
        predecessor_id: predecessor.learning_id,
        successor_id: predecessor.learning_id,
        reason: "invalid self supersession",
        superseded_at: t3
      }
    }),
    /SELF_SUPERSESSION/
  );
});

test("legacy superseded records without successor_id remain readable", () => {
  const predecessor = canonicalDecision();
  const legacy = validateLearningObjectV1({
    ...predecessor,
    lifecycle_state: "SUPERSEDED",
    version: predecessor.version + 1,
    updated_at: t3,
    supersession: {
      predecessor_id: predecessor.learning_id,
      reason: "legacy record created before successor lineage was retained",
      superseded_at: t3
    }
  });

  assert.equal(legacy.lifecycle_state, "SUPERSEDED");
  assert.equal(legacy.supersession?.predecessor_id, predecessor.learning_id);
  assert.equal(legacy.supersession?.successor_id, undefined);
});

test("only a canonical learning object can be superseded", () => {
  const candidate = createLearningCandidateV1({
    learning_id: "learning:candidate:1",
    kind: "STRATEGIC_DECISION",
    truth_state: "KNOWN",
    scope: "COMPANY",
    title: "Candidate",
    content: "Not yet company truth.",
    confidence: 0.5,
    observed_at: t0,
    evidence: [{ evidence_id: "e:2", source_lineage_id: "source:2", observed_at: t0 }]
  });

  assert.throws(
    () => supersedeLearningV1(candidate as LearningObjectV1, "learning:decision:2", "not canonical", t3),
    /INVALID_SUPERSESSION_TRANSITION/
  );
});

test("supersession cannot travel backward in time", () => {
  const predecessor = canonicalDecision();
  assert.throws(
    () => supersedeLearningV1(predecessor as LearningObjectV1, "learning:decision:2", "bad timestamp", t1),
    /NON_MONOTONIC_TIMESTAMP/
  );
});
