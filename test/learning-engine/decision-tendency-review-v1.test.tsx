import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionLearningRecordInputV1 } from "../../src/lib/learning-engine/decision-record-v1";
import {
  buildDecisionTendencyReviewV1,
  type DecisionTendencyObservationV1,
} from "../../src/lib/learning-engine/decision-tendency-review-v1";

const EVALUATED_AT = "2026-09-19T07:45:00.000Z";

function record(
  id: string,
  actionStatus: DecisionLearningRecordInputV1["ACTION_STATUS"] = "approved",
): DecisionLearningRecordInputV1 {
  return {
    id,
    recommendation_id: `recommendation:${id}`,
    HYPOTHESIS: "Recorded business decision hypothesis.",
    PREDICTED_OUTCOME_RANGE: {
      metric: "decision_outcome",
      unit: "COUNT",
      low: 0,
      expected: 1,
      high: 1,
      rationale: ["Recorded expectation."],
    },
    CONFIDENCE: "medium",
    KEY_ASSUMPTIONS: ["Context may change."],
    SUCCESS_CRITERIA: ["Outcome is reviewed separately."],
    EVALUATION_WINDOW: {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-09-18T00:00:00.000Z",
    },
    ACTION_STATUS: actionStatus,
    OBSERVED_OUTCOME: {
      metric: "decision_outcome",
      value: null,
      unit: "COUNT",
      observed_at: null,
      evidence_refs: [],
      unknown_reason: "Outcome quality is intentionally not used by tendency review.",
    },
    ATTRIBUTION_CONFIDENCE: "UNKNOWN",
    ATTRIBUTION_CLASS: "NOT_ESTABLISHED",
    RESULT_VS_PREDICTION: "UNKNOWN",
    LESSON: "Do not convert one choice into a permanent preference.",
    CALIBRATION_ERROR: "UNKNOWN",
    POLICY_UPDATE_CANDIDATE: null,
  };
}

function observation(input: {
  decisionId: string;
  selectedPole?: DecisionTendencyObservationV1["selectedPole"];
  truthState?: DecisionTendencyObservationV1["truthState"];
  observedAt?: string;
  firstPoleLabel?: string;
  secondPoleLabel?: string;
  contextClass?: DecisionTendencyObservationV1["contextClass"];
  dimension?: DecisionTendencyObservationV1["dimension"];
}): DecisionTendencyObservationV1 {
  return {
    decisionId: input.decisionId,
    dimension: input.dimension ?? "CONTROL_VS_CASH",
    firstPoleLabel: input.firstPoleLabel ?? "retain control",
    secondPoleLabel: input.secondPoleLabel ?? "maximize immediate cash",
    selectedPole: input.selectedPole ?? "FIRST_POLE",
    contextClass: input.contextClass ?? "PARTNERSHIP",
    truthState: input.truthState ?? "KNOWN",
    observedAt: input.observedAt ?? "2026-09-10T00:00:00.000Z",
    evidenceRefs: [`evidence:decision-choice:${input.decisionId}`],
  };
}

test("surfaces repeated observed choices without establishing a permanent preference or future recommendation", () => {
  const result = buildDecisionTendencyReviewV1({
    records: [record("decision:a"), record("decision:b", "executed"), record("decision:c", "successful")],
    observations: [
      observation({ decisionId: "decision:a", contextClass: "PARTNERSHIP" }),
      observation({ decisionId: "decision:b", contextClass: "LICENSING" }),
      observation({ decisionId: "decision:c", contextClass: "NEGOTIATION" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "SIGNALS_AVAILABLE");
  assert.equal(result.signals.length, 1);
  const signal = result.signals[0];
  assert.equal(signal.state, "REPEATED_FIRST_POLE");
  assert.deepEqual(signal.firstPoleDecisionIds, ["decision:a", "decision:b", "decision:c"]);
  assert.deepEqual(signal.contextClasses, ["LICENSING", "NEGOTIATION", "PARTNERSHIP"]);
  assert.equal(signal.permanentPreferenceClaim, "NOT_ESTABLISHED");
  assert.equal(signal.outcomeQualityClaim, "NOT_EVALUATED");
  assert.equal(signal.causalClaim, "NOT_ESTABLISHED");
  assert.equal(signal.recommendationAuthority, "NONE");
  assert.equal(result.authority.permanentPreferenceInferenceAllowed, false);
  assert.equal(result.authority.recommendationAllowed, false);
  assert.equal(result.authority.autonomousDecisionAllowed, false);
  assert.equal(result.authority.policyPromotionAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("preserves mixed choices as context-dependent instead of forcing a preference", () => {
  const result = buildDecisionTendencyReviewV1({
    records: [record("decision:a"), record("decision:b"), record("decision:c")],
    observations: [
      observation({ decisionId: "decision:a", selectedPole: "FIRST_POLE" }),
      observation({ decisionId: "decision:b", selectedPole: "SECOND_POLE" }),
      observation({ decisionId: "decision:c", selectedPole: "BALANCED_OR_CONTEXTUAL" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.signals[0].state, "MIXED_OR_CONTEXT_DEPENDENT");
  assert.deepEqual(result.signals[0].firstPoleDecisionIds, ["decision:a"]);
  assert.deepEqual(result.signals[0].secondPoleDecisionIds, ["decision:b"]);
  assert.deepEqual(result.signals[0].balancedOrContextualDecisionIds, ["decision:c"]);
});

test("flags a two-window directional flip only as potential drift review", () => {
  const result = buildDecisionTendencyReviewV1({
    records: [record("decision:a"), record("decision:b"), record("decision:c"), record("decision:d")],
    observations: [
      observation({ decisionId: "decision:a", selectedPole: "FIRST_POLE", observedAt: "2026-06-01T00:00:00.000Z" }),
      observation({ decisionId: "decision:b", selectedPole: "FIRST_POLE", observedAt: "2026-07-01T00:00:00.000Z" }),
      observation({ decisionId: "decision:c", selectedPole: "SECOND_POLE", observedAt: "2026-08-01T00:00:00.000Z" }),
      observation({ decisionId: "decision:d", selectedPole: "SECOND_POLE", observedAt: "2026-09-01T00:00:00.000Z" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  const signal = result.signals[0];
  assert.equal(signal.state, "POTENTIAL_DRIFT_REVIEW");
  assert.deepEqual(signal.driftReview, {
    previousPole: "FIRST_POLE",
    recentPole: "SECOND_POLE",
    previousDecisionIds: ["decision:a", "decision:b"],
    recentDecisionIds: ["decision:c", "decision:d"],
  });
  assert.equal(signal.permanentPreferenceClaim, "NOT_ESTABLISHED");
  assert.match(result.limitations.join(" "), /not a claim that preferences changed or why they changed/i);
});

test("does not learn from a recommendation that was never approved", () => {
  const result = buildDecisionTendencyReviewV1({
    records: [record("decision:recommended-only", "recommended")],
    observations: [observation({ decisionId: "decision:recommended-only" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.deepEqual(result.signals, []);
  assert.deepEqual(result.withheldDecisionIds, ["decision:recommended-only"]);
  assert.deepEqual(result.issues, ["DECISION_NOT_YET_APPROVED"]);
});

test("withholds inferred, unknown, stale, conflicted, future, and unmatched observations", () => {
  const ids = ["decision:inferred", "decision:unknown", "decision:stale", "decision:conflicted", "decision:future"];
  const result = buildDecisionTendencyReviewV1({
    records: ids.map((id) => record(id)),
    observations: [
      observation({ decisionId: "decision:inferred", truthState: "INFERRED" }),
      observation({ decisionId: "decision:unknown", truthState: "UNKNOWN" }),
      observation({ decisionId: "decision:stale", truthState: "STALE" }),
      observation({ decisionId: "decision:conflicted", truthState: "CONFLICTED" }),
      observation({ decisionId: "decision:future", observedAt: "2026-09-20T00:00:00.000Z" }),
      observation({ decisionId: "decision:missing" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.deepEqual(result.signals, []);
  assert.deepEqual(result.withheldDecisionIds, [
    "decision:conflicted",
    "decision:future",
    "decision:inferred",
    "decision:stale",
    "decision:unknown",
  ]);
  assert.deepEqual(result.unmatchedDecisionIds, ["decision:missing"]);
  assert.deepEqual(result.issues, [
    "DECISION_RECORD_UNMATCHED",
    "FUTURE_OBSERVATION_WITHHELD",
    "OBSERVATION_CONFLICTED",
    "OBSERVATION_INFERRED",
    "OBSERVATION_STALE",
    "OBSERVATION_UNKNOWN",
  ]);
});

test("fails closed when a dimension's pole labels conflict across durable history", () => {
  const result = buildDecisionTendencyReviewV1({
    records: [record("decision:a"), record("decision:b"), record("decision:c")],
    observations: [
      observation({ decisionId: "decision:a" }),
      observation({ decisionId: "decision:b" }),
      observation({
        decisionId: "decision:c",
        firstPoleLabel: "maximize control",
        secondPoleLabel: "maximize liquidity",
      }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.deepEqual(result.signals, []);
  assert.deepEqual(result.withheldDecisionIds, ["decision:a", "decision:b", "decision:c"]);
  assert.deepEqual(result.issues, ["DIMENSION_LABEL_CONFLICT:CONTROL_VS_CASH"]);
});

test("requires the configured minimum distinct decisions before calling a repeated choice a tendency", () => {
  const result = buildDecisionTendencyReviewV1({
    records: [record("decision:a"), record("decision:b")],
    observations: [observation({ decisionId: "decision:a" }), observation({ decisionId: "decision:b" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.signals[0].state, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.signals[0].observedDecisionCount, 2);
});

test("does not synthesize confidence, money, or outcome quality from repeated choices", () => {
  const result = buildDecisionTendencyReviewV1({
    records: [record("decision:a"), record("decision:b"), record("decision:c")],
    observations: [observation({ decisionId: "decision:a" }), observation({ decisionId: "decision:b" }), observation({ decisionId: "decision:c" })],
    evaluatedAt: EVALUATED_AT,
  });

  const signal = result.signals[0] as unknown as Record<string, unknown>;
  assert.equal("confidence" in signal, false);
  assert.equal("expectedValue" in signal, false);
  assert.equal("monetaryValue" in signal, false);
  assert.equal(result.authority.confidenceSynthesisAllowed, false);
  assert.equal(result.authority.monetaryValueSynthesisAllowed, false);
  assert.equal(result.signals[0].outcomeQualityClaim, "NOT_EVALUATED");
});

test("is deterministic and immutable and rejects duplicate decision-dimension observations", () => {
  const records = [record("decision:c"), record("decision:a"), record("decision:b")];
  const observations = [
    observation({ decisionId: "decision:c", observedAt: "2026-09-03T00:00:00.000Z" }),
    observation({ decisionId: "decision:a", observedAt: "2026-09-01T00:00:00.000Z" }),
    observation({ decisionId: "decision:b", observedAt: "2026-09-02T00:00:00.000Z" }),
  ];

  const first = buildDecisionTendencyReviewV1({ records, observations, evaluatedAt: EVALUATED_AT });
  const second = buildDecisionTendencyReviewV1({
    records: [...records].reverse(),
    observations: [...observations].reverse(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.signals[0]), true);

  assert.throws(
    () =>
      buildDecisionTendencyReviewV1({
        records: [record("decision:a")],
        observations: [observation({ decisionId: "decision:a" }), observation({ decisionId: "decision:a" })],
        evaluatedAt: EVALUATED_AT,
      }),
    /Duplicate decision tendency observation/,
  );
});
