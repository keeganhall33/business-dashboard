import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionLearningRecordInputV1 } from "../../src/lib/learning-engine/decision-record-v1";
import {
  buildNegotiationPricingLearningReviewV1,
  type NegotiationDecisionContextV1,
} from "../../src/lib/learning-engine/negotiation-pricing-learning-v1";

const EVALUATED_AT = "2026-09-19T04:30:00.000Z";

function record(input: {
  id: string;
  actionStatus?: DecisionLearningRecordInputV1["ACTION_STATUS"];
  result?: DecisionLearningRecordInputV1["RESULT_VS_PREDICTION"];
  attribution?: DecisionLearningRecordInputV1["ATTRIBUTION_CONFIDENCE"];
  observedAt?: string | null;
  observedValue?: number | null;
  lesson?: string;
}): DecisionLearningRecordInputV1 {
  return {
    id: input.id,
    recommendation_id: `recommendation:${input.id}`,
    HYPOTHESIS: "Holding price while improving the package may preserve positioning.",
    PREDICTED_OUTCOME_RANGE: {
      metric: "accepted_offer_count",
      unit: "COUNT",
      low: 0,
      expected: 1,
      high: 1,
      rationale: ["Recorded pre-decision expectation."],
    },
    CONFIDENCE: "medium",
    KEY_ASSUMPTIONS: ["The package is otherwise comparable."],
    SUCCESS_CRITERIA: ["A recorded decision outcome exists."],
    EVALUATION_WINDOW: {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-09-18T00:00:00.000Z",
    },
    ACTION_STATUS: input.actionStatus ?? "successful",
    OBSERVED_OUTCOME: {
      metric: "accepted_offer_count",
      value: input.observedValue === undefined ? 1 : input.observedValue,
      unit: "COUNT",
      observed_at: input.observedAt === undefined ? "2026-09-10T00:00:00.000Z" : input.observedAt,
      evidence_refs: input.observedAt === null ? [] : [`evidence:outcome:${input.id}`],
      unknown_reason: input.observedAt === null ? "Outcome has not been recorded yet." : null,
    },
    ATTRIBUTION_CONFIDENCE: input.attribution ?? "LOW",
    RESULT_VS_PREDICTION: input.result ?? "WITHIN_RANGE",
    LESSON: input.lesson ?? "Package framing should be reviewed again in comparable future deals.",
    CALIBRATION_ERROR: "LOW",
    POLICY_UPDATE_CANDIDATE: "Never auto-promote this text from this review.",
  };
}

function context(input: {
  decisionId: string;
  dealId: string;
  counterparty?: string | null;
  truthState?: NegotiationDecisionContextV1["truthState"];
  tag?: NegotiationDecisionContextV1["learningTags"][number];
  observedAt?: string;
}): NegotiationDecisionContextV1 {
  return {
    decisionId: input.decisionId,
    dealId: input.dealId,
    dealClass: "PARTNERSHIP",
    counterpartyCanonicalId: input.counterparty === undefined ? `organization:${input.dealId}` : input.counterparty,
    truthState: input.truthState ?? "KNOWN",
    observedAt: input.observedAt ?? "2026-09-09T00:00:00.000Z",
    learningTags: [input.tag ?? "PRICE_HOLD"],
    evidenceRefs: [`evidence:context:${input.decisionId}`],
  };
}

test("surfaces a cross-deal negotiation lesson candidate without creating causal or pricing authority", () => {
  const result = buildNegotiationPricingLearningReviewV1({
    records: [record({ id: "decision:a" }), record({ id: "decision:b", attribution: "MEDIUM" })],
    contexts: [
      context({ decisionId: "decision:a", dealId: "deal:a", counterparty: "organization:a" }),
      context({ decisionId: "decision:b", dealId: "deal:b", counterparty: "organization:b" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.observations.length, 2);
  assert.equal(result.recurringLessonCandidates.length, 1);
  const candidate = result.recurringLessonCandidates[0];
  assert.equal(candidate.learningTag, "PRICE_HOLD");
  assert.equal(candidate.recurrenceState, "CROSS_COUNTERPARTY_REVIEW_CANDIDATE");
  assert.deepEqual(candidate.dealIds, ["deal:a", "deal:b"]);
  assert.equal(candidate.causalClaim, "NOT_ESTABLISHED");
  assert.equal(candidate.reviewState, "REVIEW_CANDIDATE_ONLY");
  assert.equal(candidate.pricingRuleCreated, false);
  assert.equal(candidate.negotiationRuleCreated, false);
  assert.equal(result.authority.priceMutationAllowed, false);
  assert.equal(result.authority.policyPromotionAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("does not call one recorded deal a recurring lesson", () => {
  const result = buildNegotiationPricingLearningReviewV1({
    records: [record({ id: "decision:a" })],
    contexts: [context({ decisionId: "decision:a", dealId: "deal:a" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.observations.length, 1);
  assert.deepEqual(result.recurringLessonCandidates, []);
});

test("preserves an unknown outcome as unknown and excludes it from recurring pattern evidence", () => {
  const result = buildNegotiationPricingLearningReviewV1({
    records: [
      record({ id: "decision:a" }),
      record({ id: "decision:b", observedAt: null, observedValue: null, result: "UNKNOWN" }),
    ],
    contexts: [
      context({ decisionId: "decision:a", dealId: "deal:a" }),
      context({ decisionId: "decision:b", dealId: "deal:b" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.observations.length, 2);
  const unknown = result.observations.find((item) => item.decisionId === "decision:b");
  assert.equal(unknown?.observedOutcome.state, "UNKNOWN");
  assert.equal(unknown?.observedOutcome.value, null);
  assert.deepEqual(result.recurringLessonCandidates, []);
});

test("withholds inferred or conflicted negotiation context instead of treating it as business memory", () => {
  const result = buildNegotiationPricingLearningReviewV1({
    records: [record({ id: "decision:a" }), record({ id: "decision:b" })],
    contexts: [
      context({ decisionId: "decision:a", dealId: "deal:a", truthState: "INFERRED" }),
      context({ decisionId: "decision:b", dealId: "deal:b", truthState: "CONFLICTED" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_EVIDENCE");
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.withheldDecisionIds, ["decision:a", "decision:b"]);
  assert.deepEqual(result.issues, ["CONTEXT_CONFLICTED", "CONTEXT_INFERRED"]);
});

test("reports an exact unmatched decision linkage rather than guessing a comparable record", () => {
  const result = buildNegotiationPricingLearningReviewV1({
    records: [record({ id: "decision:other" })],
    contexts: [context({ decisionId: "decision:a", dealId: "deal:a" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_EVIDENCE");
  assert.deepEqual(result.unmatchedDecisionIds, ["decision:a"]);
  assert.deepEqual(result.issues, ["DECISION_RECORD_UNMATCHED"]);
});

test("withholds a future-dated recorded outcome from durable lesson review", () => {
  const result = buildNegotiationPricingLearningReviewV1({
    records: [record({ id: "decision:a", observedAt: "2026-09-20T00:00:00.000Z" })],
    contexts: [context({ decisionId: "decision:a", dealId: "deal:a" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_EVIDENCE");
  assert.deepEqual(result.withheldDecisionIds, ["decision:a"]);
  assert.deepEqual(result.issues, ["FUTURE_OUTCOME_WITHHELD"]);
});

test("retains recorded monetary values only as source observations and never synthesizes a value claim", () => {
  const moneyRecord = record({ id: "decision:money" });
  moneyRecord.OBSERVED_OUTCOME.metric = "contract_value";
  moneyRecord.OBSERVED_OUTCOME.unit = "USD_CENTS";
  moneyRecord.OBSERVED_OUTCOME.value = 2500000;

  const result = buildNegotiationPricingLearningReviewV1({
    records: [moneyRecord],
    contexts: [context({ decisionId: "decision:money", dealId: "deal:money", tag: "PACKAGE_OPTIONS" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.observations[0].observedOutcome.value, 2500000);
  assert.equal(result.observations[0].observedOutcome.unit, "USD_CENTS");
  assert.equal(result.observations[0].causalClaim, "NOT_ESTABLISHED");
  assert.equal(result.recurringLessonCandidates.length, 0);
  assert.match(result.limitations.join(" "), /does not create expected value, uplift, ROI, or confidence/i);
});

test("rejects duplicate contexts and future context timestamps", () => {
  assert.throws(
    () =>
      buildNegotiationPricingLearningReviewV1({
        records: [record({ id: "decision:a" })],
        contexts: [
          context({ decisionId: "decision:a", dealId: "deal:a" }),
          context({ decisionId: "decision:a", dealId: "deal:b" }),
        ],
        evaluatedAt: EVALUATED_AT,
      }),
    /Duplicate negotiation context/,
  );

  assert.throws(
    () =>
      buildNegotiationPricingLearningReviewV1({
        records: [record({ id: "decision:a" })],
        contexts: [
          context({
            decisionId: "decision:a",
            dealId: "deal:a",
            observedAt: "2026-09-20T00:00:00.000Z",
          }),
        ],
        evaluatedAt: EVALUATED_AT,
      }),
    /cannot be in the future/,
  );
});
