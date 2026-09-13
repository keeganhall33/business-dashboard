import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFLICTED,
  INFERRED,
  KNOWN,
  MAX_LEARNING_ARRAY_ITEMS,
  MAX_LEARNING_TEXT_BYTES,
  STALE,
  UNKNOWN,
  approveLearningCandidateV1,
  createFactCorrectionCandidateV1,
  createLearningCandidateV1,
  createPreferencePolicyCandidateV1,
  createTechniqueSkillCandidateV1,
  createValidatedLessonCandidateV1,
  promoteLearningToCanonicalV1,
  supersedeLearningV1,
  validateLearningObjectV1,
  type LearningObjectV1
} from "@/lib/intelligence/organizational-learning/learning-object-v1";

const t0 = "2026-09-13T00:00:00.000Z";
const t1 = "2026-09-13T00:01:00.000Z";
const t2 = "2026-09-13T00:02:00.000Z";
const evidence = [{ evidence_id: "e:1", source_lineage_id: "source:1", observed_at: t0 }];

function candidate(overrides: Record<string, unknown> = {}) {
  return createLearningCandidateV1({
    learning_id: "learning:1",
    kind: "STRATEGIC_DECISION",
    truth_state: KNOWN,
    scope: "COMPANY",
    title: "Decision",
    content: "Use governed evidence.",
    confidence: 1,
    observed_at: t0,
    evidence,
    ...overrides
  });
}

function canonical(overrides: Record<string, unknown> = {}) {
  const approved = approveLearningCandidateV1(candidate(overrides), {
    reviewer_id: "reviewer:1",
    reviewed_at: t1,
    decision: "APPROVE"
  });
  return promoteLearningToCanonicalV1(approved, t2);
}

test("runtime schema import validates and freezes a candidate", () => {
  const value = candidate();
  assert.equal(value.lifecycle_state, "CANDIDATE");
  assert.equal(value.approval, null);
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.evidence));
});

test("preserves every governed truth state without making a candidate canonical", () => {
  for (const truth_state of [KNOWN, INFERRED, UNKNOWN, STALE, CONFLICTED] as const) {
    assert.equal(candidate({ truth_state }).lifecycle_state, "CANDIDATE");
  }
});

test("fact correction remains a candidate", () => {
  const value = createFactCorrectionCandidateV1({
    learning_id: "fact:1", truth_state: KNOWN, scope: "COMPANY", title: "Correction",
    content: "Corrected fact", confidence: 1, observed_at: t0, evidence
  });
  assert.equal(value.kind, "FACT_CORRECTION");
  assert.equal(value.lifecycle_state, "CANDIDATE");
});

test("strategic decision supersession preserves predecessor identity and reason", () => {
  const value = supersedeLearningV1(canonical(), "learning:2", "New governed decision", "2026-09-13T00:03:00.000Z");
  assert.equal(value.lifecycle_state, "SUPERSEDED");
  assert.equal(value.supersession?.predecessor_id, "learning:1");
  assert.equal(value.supersession?.reason, "New governed decision");
});

test("repeated preference and proven technique are policy and skill candidates", () => {
  const shared = { truth_state: INFERRED, scope: "TEAM" as const, confidence: 0.8, observed_at: t0, evidence };
  assert.equal(createPreferencePolicyCandidateV1({ learning_id: "policy:1", title: "Repeated preference", content: "Prefer concise output", ...shared }).kind, "PREFERENCE_POLICY");
  assert.equal(createTechniqueSkillCandidateV1({ learning_id: "skill:1", title: "Proven technique", content: "Use deterministic tests", ...shared }).kind, "TECHNIQUE_SKILL");
});

test("reviewed lesson becomes canonical only after approval", () => {
  const lesson = createValidatedLessonCandidateV1({
    learning_id: "lesson:1", truth_state: KNOWN, scope: "COMPANY", title: "Lesson",
    content: "Validate exact head", confidence: 1, observed_at: t0, evidence
  });
  assert.throws(() => promoteLearningToCanonicalV1(lesson, t1), /CANONICAL_REQUIRES_APPROVED_CANDIDATE/);
  const approved = approveLearningCandidateV1(lesson, { reviewer_id: "reviewer:1", reviewed_at: t1, decision: "APPROVE" });
  assert.equal(promoteLearningToCanonicalV1(approved, t2).lifecycle_state, "CANONICAL");
});

test("fails closed on unsupported kinds and lifecycle states", () => {
  const value = candidate();
  assert.throws(() => validateLearningObjectV1({ ...value, kind: "MODEL_GUESS" }), /INVALID_LEARNING_OBJECT/);
  assert.throws(() => validateLearningObjectV1({ ...value, lifecycle_state: "PUBLISHED" }), /INVALID_LEARNING_OBJECT/);
});

test("rejects inferred canonical truth without evidence", () => {
  const value = canonical({ truth_state: INFERRED });
  assert.throws(() => validateLearningObjectV1({ ...value, evidence: [] }), /INFERENCE_REQUIRES_EVIDENCE/);
});

test("rejects canonical state without approval or provenance", () => {
  assert.throws(() => validateLearningObjectV1({ ...candidate(), lifecycle_state: "CANONICAL" }), /CANONICAL_REQUIRES_APPROVAL/);
});

test("rejects invalid, self, and circular supersession", () => {
  assert.throws(() => supersedeLearningV1(candidate(), "learning:2", "reason", t2), /INVALID_SUPERSESSION_TRANSITION/);
  assert.throws(() => supersedeLearningV1(canonical(), "learning:1", "reason", "2026-09-13T00:03:00.000Z"), /SELF_SUPERSESSION/);
  assert.throws(() => supersedeLearningV1(canonical(), "learning:2", "reason", "2026-09-13T00:03:00.000Z", ["learning:2"]), /CIRCULAR_SUPERSESSION/);
});

test("rejects non-monotonic timestamps and invalid confidence", () => {
  assert.throws(() => approveLearningCandidateV1(candidate(), { reviewer_id: "r:1", reviewed_at: "2026-09-12T23:59:00.000Z", decision: "APPROVE" }), /NON_MONOTONIC_TIMESTAMP/);
  assert.throws(() => candidate({ confidence: 1.01 }), /INVALID_LEARNING_OBJECT/);
});

test("rejects oversized text and arrays", () => {
  assert.throws(() => candidate({ content: "x".repeat(MAX_LEARNING_TEXT_BYTES + 1) }), /CONTENT_TOO_LARGE/);
  assert.throws(() => candidate({ evidence: Array.from({ length: MAX_LEARNING_ARRAY_ITEMS + 1 }, (_, index) => ({ evidence_id: `e:${index}`, source_lineage_id: "s:1", observed_at: t0 })) }), /INVALID_LEARNING_OBJECT/);
});

test("evidence ordering is deterministic and returned inputs cannot be mutated", () => {
  const forward = candidate({ evidence: [
    { evidence_id: "e:2", source_lineage_id: "s:2", observed_at: t1 },
    { evidence_id: "e:1", source_lineage_id: "s:1", observed_at: t0 }
  ] });
  const reverse = candidate({ evidence: [...forward.evidence].reverse() });
  assert.deepEqual(forward.evidence, reverse.evidence);
  assert.throws(() => (forward.evidence as LearningObjectV1["evidence"] & { push: Function }).push(evidence[0]));
});
