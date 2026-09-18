import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_RECURRING_LESSON_OBSERVATIONS,
  evaluateRecurringDecisionLessonV1,
  type RecurringDecisionLessonInputV1,
  type RecurringLessonObservationV1
} from "@/lib/intelligence/organizational-learning/recurring-decision-lessons-v1";
import {
  approveLearningCandidateV1,
  createValidatedLessonCandidateV1,
  promoteLearningToCanonicalV1,
  validateLearningObjectV1,
  type LearningObjectV1,
  type LearningTruthState
} from "@/lib/intelligence/organizational-learning/learning-object-v1";

const t0 = "2026-09-01T00:00:00.000Z";
const t1 = "2026-09-01T00:01:00.000Z";
const t2 = "2026-09-01T00:02:00.000Z";
const evaluatedAt = "2026-09-18T09:30:00.000Z";

function approvedLesson(
  id: string,
  lineage: string,
  overrides: {
    title?: string;
    content?: string;
    truthState?: LearningTruthState;
    canonical?: boolean;
  } = {}
): Readonly<LearningObjectV1> {
  const candidate = createValidatedLessonCandidateV1({
    learning_id: id,
    truth_state: overrides.truthState ?? "KNOWN",
    scope: "COMPANY",
    title: overrides.title ?? "Protect scarcity before broad promotion",
    content: overrides.content ?? "Private validation before broad promotion preserved scarcity in the observed cases.",
    confidence: 0.5,
    observed_at: t0,
    evidence: [{ evidence_id: `evidence:${id}`, source_lineage_id: lineage, observed_at: t0 }]
  });
  const approved = approveLearningCandidateV1(candidate as LearningObjectV1, {
    reviewer_id: `reviewer:${id}`,
    reviewed_at: t1,
    decision: "APPROVE"
  });
  if (!overrides.canonical) return approved;
  return promoteLearningToCanonicalV1(approved as LearningObjectV1, t2);
}

function observation(
  n: number,
  overrides: Partial<RecurringLessonObservationV1> = {}
): RecurringLessonObservationV1 {
  const lineage = `lineage:${n}`;
  return {
    observation_id: `observation:${n}`,
    decision_ref: `decision:${n}`,
    outcome_ref: `outcome:${n}`,
    independence_key: lineage,
    observed_at: "2026-09-17T12:00:00.000Z",
    learning_object: approvedLesson(`lesson:${n}`, lineage) as LearningObjectV1,
    ...overrides
  };
}

function input(
  observations: readonly RecurringLessonObservationV1[],
  overrides: Partial<RecurringDecisionLessonInputV1> = {}
): RecurringDecisionLessonInputV1 {
  return {
    domain: "STRATEGY",
    pattern_key: "scarcity-before-broad-promotion",
    evaluated_at: evaluatedAt,
    observations,
    ...overrides
  };
}

test("surfaces an independently repeated approved lesson only as a review candidate", () => {
  const value = evaluateRecurringDecisionLessonV1(input([observation(1), observation(2)]));

  assert.equal(value.state, "REVIEW_CANDIDATE");
  assert.equal(value.reason_code, "REPEATED_APPROVED_LESSON");
  assert.equal(value.causal_interpretation, "NOT_ESTABLISHED");
  assert.equal(value.review_required, true);
  assert.equal(value.policy_promotion_allowed, false);
  assert.equal(value.pricing_change_allowed, false);
  assert.equal(value.negotiation_action_allowed, false);
  assert.equal(value.external_action_allowed, false);
  assert.equal(value.persistence_authority, false);
  assert.deepEqual(value.decision_refs, ["decision:1", "decision:2"]);
  assert.deepEqual(value.outcome_refs, ["outcome:1", "outcome:2"]);
  assert.deepEqual(value.source_lineage_ids, ["lineage:1", "lineage:2"]);
  assert.equal("confidence" in value, false);
  assert.equal("monetary_value" in value, false);
});

test("pricing and negotiation patterns never gain price or negotiation authority", () => {
  for (const domain of ["PRICING", "NEGOTIATION"] as const) {
    const value = evaluateRecurringDecisionLessonV1(input([observation(1), observation(2)], { domain }));
    assert.equal(value.state, "REVIEW_CANDIDATE");
    assert.equal(value.pricing_change_allowed, false);
    assert.equal(value.negotiation_action_allowed, false);
    assert.equal(value.causal_interpretation, "NOT_ESTABLISHED");
  }
});

test("duplicate copies of one source cannot manufacture recurrence", () => {
  const first = observation(1);
  const copied: RecurringLessonObservationV1 = {
    ...first,
    observation_id: "observation:copy"
  };
  const value = evaluateRecurringDecisionLessonV1(input([first, copied]));

  assert.equal(value.state, "INSUFFICIENT_INDEPENDENT_EVIDENCE");
  assert.ok(value.duplicate_observation_ids.includes("observation:copy"));
  assert.ok(value.verification_reasons.includes("INSUFFICIENT_SOURCE_INDEPENDENCE"));
});

test("two sources tied to the same decision and outcome are not treated as recurring decisions", () => {
  const value = evaluateRecurringDecisionLessonV1(input([
    observation(1),
    observation(2, { decision_ref: "decision:1", outcome_ref: "outcome:1" })
  ]));

  assert.equal(value.state, "INSUFFICIENT_INDEPENDENT_EVIDENCE");
  assert.ok(value.verification_reasons.includes("INSUFFICIENT_DISTINCT_DECISIONS"));
  assert.ok(value.verification_reasons.includes("INSUFFICIENT_DISTINCT_OUTCOMES"));
});

test("materially different lesson statements under one pattern fail closed as conflicted", () => {
  const second = observation(2, {
    learning_object: approvedLesson("lesson:2", "lineage:2", {
      content: "Broad promotion before private validation performed better in the observed case."
    }) as LearningObjectV1
  });
  const value = evaluateRecurringDecisionLessonV1(input([observation(1), second]));

  assert.equal(value.state, "CONFLICTED");
  assert.equal(value.reason_code, "MATERIAL_STATEMENT_CONFLICT");
  assert.equal(value.lesson_content, null);
  assert.ok(value.verification_reasons.includes("LESSON_STATEMENTS_DISAGREE"));
});

test("unapproved, inferred, stale, or superseded source lessons require verification", () => {
  const unapproved = createValidatedLessonCandidateV1({
    learning_id: "lesson:unapproved",
    truth_state: "KNOWN",
    scope: "COMPANY",
    title: "Protect scarcity before broad promotion",
    content: "Private validation before broad promotion preserved scarcity in the observed cases.",
    confidence: 0.5,
    observed_at: t0,
    evidence: [{ evidence_id: "e:u", source_lineage_id: "lineage:u", observed_at: t0 }]
  });
  const inferred = approvedLesson("lesson:inferred", "lineage:i", { truthState: "INFERRED" });
  const canonical = approvedLesson("lesson:canonical", "lineage:s", { canonical: true });
  const superseded = validateLearningObjectV1({
    ...canonical,
    learning_id: "lesson:superseded",
    lifecycle_state: "SUPERSEDED",
    version: canonical.version + 1,
    updated_at: "2026-09-01T00:03:00.000Z",
    supersession: {
      predecessor_id: "lesson:canonical",
      reason: "New reviewed evidence",
      superseded_at: "2026-09-01T00:03:00.000Z"
    }
  });

  const cases: Array<[LearningObjectV1, string, string]> = [
    [unapproved as LearningObjectV1, "lineage:u", "SOURCE_LESSON_NOT_APPROVED"],
    [inferred as LearningObjectV1, "lineage:i", "SOURCE_TRUTH_INFERRED"],
    [superseded as LearningObjectV1, "lineage:s", "SOURCE_LESSON_NOT_APPROVED"]
  ];

  for (const [learning, lineage, expectedReason] of cases) {
    const value = evaluateRecurringDecisionLessonV1(input([
      observation(1),
      observation(2, { independence_key: lineage, learning_object: learning })
    ]));
    assert.equal(value.state, "NEEDS_VERIFICATION");
    assert.ok(value.verification_reasons.includes(expectedReason));
  }

  const stale = evaluateRecurringDecisionLessonV1(input([
    observation(1),
    observation(2, { observed_at: "2025-01-01T00:00:00.000Z" })
  ], { max_age_ms: 30 * 24 * 60 * 60 * 1000 }));
  assert.equal(stale.state, "NEEDS_VERIFICATION");
  assert.ok(stale.verification_reasons.includes("OBSERVATION_STALE"));
});

test("independence must be backed by the source lesson evidence lineage", () => {
  const value = evaluateRecurringDecisionLessonV1(input([
    observation(1),
    observation(2, { independence_key: "lineage:not-present" })
  ]));

  assert.equal(value.state, "NEEDS_VERIFICATION");
  assert.ok(value.verification_reasons.includes("INDEPENDENCE_KEY_NOT_EVIDENCED"));
});

test("future, duplicate-id, malformed, and unbounded inputs fail closed", () => {
  assert.equal(evaluateRecurringDecisionLessonV1(input([
    observation(1),
    observation(2, { observed_at: "2027-01-01T00:00:00.000Z" })
  ])).state, "INVALID_INPUT");

  assert.equal(evaluateRecurringDecisionLessonV1(input([
    observation(1),
    observation(2, { observation_id: "observation:1" })
  ])).state, "INVALID_INPUT");

  assert.equal(evaluateRecurringDecisionLessonV1({
    ...input([observation(1), observation(2)]),
    pattern_key: ""
  }).state, "INVALID_INPUT");

  assert.equal(evaluateRecurringDecisionLessonV1({
    ...input([observation(1)]),
    observations: Array.from({ length: MAX_RECURRING_LESSON_OBSERVATIONS + 1 }, (_, index) => observation(index + 1))
  }).state, "INVALID_INPUT");
});

test("output is deterministic and immutable without mutating caller input", () => {
  const observations = [observation(2), observation(1)];
  const before = structuredClone(observations);
  const forward = evaluateRecurringDecisionLessonV1(input(observations));
  const reverse = evaluateRecurringDecisionLessonV1(input([...observations].reverse()));

  assert.deepEqual(forward, reverse);
  assert.deepEqual(observations, before);
  assert.ok(Object.isFrozen(forward));
  assert.ok(Object.isFrozen(forward.source_learning_ids));
  assert.throws(() => (forward.source_learning_ids as string[]).push("lesson:3"));
});
