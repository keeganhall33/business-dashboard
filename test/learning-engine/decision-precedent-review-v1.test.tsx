import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionLearningRecordInputV1 } from "../../src/lib/learning-engine/decision-record-v1";
import {
  buildDecisionPrecedentReviewV1,
  type DecisionPrecedentContextV1,
  type DecisionPrecedentQueryV1,
} from "../../src/lib/learning-engine/decision-precedent-review-v1";

const EVALUATED_AT = "2026-09-19T07:30:00.000Z";

function record(input: {
  id: string;
  observedAt?: string | null;
  observedValue?: number | null;
  unit?: DecisionLearningRecordInputV1["OBSERVED_OUTCOME"]["unit"];
  result?: DecisionLearningRecordInputV1["RESULT_VS_PREDICTION"];
  attributionClass?: DecisionLearningRecordInputV1["ATTRIBUTION_CLASS"];
  governanceState?: "DRAFT" | "REVIEWED" | "APPROVED";
  validUntil?: string | null;
}): DecisionLearningRecordInputV1 {
  const observedAt = input.observedAt === undefined ? "2026-09-10T00:00:00.000Z" : input.observedAt;
  return {
    id: input.id,
    recommendation_id: `recommendation:${input.id}`,
    HYPOTHESIS: "A bounded package structure could preserve optionality.",
    PREDICTED_OUTCOME_RANGE: {
      metric: "decision_outcome",
      unit: input.unit ?? "COUNT",
      low: 0,
      expected: 1,
      high: 1,
      rationale: ["Historical prediction retained as source context only."],
    },
    CONFIDENCE: "medium",
    KEY_ASSUMPTIONS: ["The recorded constraints remain explicit."],
    SUCCESS_CRITERIA: ["A measured outcome is recorded."],
    EVALUATION_WINDOW: {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-09-18T00:00:00.000Z",
    },
    ACTION_STATUS: "successful",
    OBSERVED_OUTCOME: {
      metric: input.unit === "USD_CENTS" ? "contract_value" : "decision_outcome",
      value: input.observedValue === undefined ? 1 : input.observedValue,
      unit: input.unit ?? "COUNT",
      observed_at: observedAt,
      evidence_refs: observedAt == null ? [] : [`evidence:outcome:${input.id}`],
      unknown_reason: observedAt == null ? "Outcome has not been recorded." : null,
    },
    ATTRIBUTION_CONFIDENCE: "LOW",
    ATTRIBUTION_CLASS: input.attributionClass ?? "NOT_ESTABLISHED",
    RESULT_VS_PREDICTION: input.result ?? (observedAt == null ? "UNKNOWN" : "WITHIN_RANGE"),
    LESSON: "Retain the observed result as historical context and reassess the present facts independently.",
    CALIBRATION_ERROR: "UNKNOWN",
    POLICY_UPDATE_CANDIDATE: null,
    DECISION_GOVERNANCE: input.governanceState
      ? {
          rationale: "Recorded rationale for the historical decision.",
          alternatives: ["Alternative A"],
          decision_actor: "Keegan",
          decision_at: "2026-09-01T00:00:00.000Z",
          approval_authority: "Keegan",
          review_state: input.governanceState,
          supporting_evidence_refs: [`evidence:decision:${input.id}`],
          contradicting_evidence_refs: [],
          valid_until: input.validUntil ?? null,
          evidence_fingerprint: "fingerprint:v1",
          revisit_on_evidence_change: false,
          superseded_by_id: null,
        }
      : undefined,
  };
}

function query(input: Partial<DecisionPrecedentQueryV1> = {}): DecisionPrecedentQueryV1 {
  return {
    decisionId: "decision:current",
    decisionClass: "PARTNERSHIP",
    domainId: "domain:brand-partnerships",
    objectiveRefs: ["objective:premium-positioning", "objective:relationship-depth"],
    constraintRefs: ["constraint:keegan-time"],
    resourceRefs: ["resource:creative-capacity"],
    approvalClass: "KEEGAN_APPROVAL_REQUIRED",
    reversibility: "PARTIALLY_REVERSIBLE",
    truthState: "KNOWN",
    observedAt: "2026-09-19T07:00:00.000Z",
    evidenceRefs: ["evidence:current-context"],
    ...input,
  };
}

function context(input: {
  decisionId: string;
  objectives?: readonly string[];
  constraints?: readonly string[];
  resources?: readonly string[];
  approvalClass?: DecisionPrecedentContextV1["approvalClass"];
  reversibility?: DecisionPrecedentContextV1["reversibility"];
  truthState?: DecisionPrecedentContextV1["truthState"];
  observedAt?: string;
  decisionClass?: DecisionPrecedentContextV1["decisionClass"];
  domainId?: string;
}): DecisionPrecedentContextV1 {
  return {
    decisionId: input.decisionId,
    decisionClass: input.decisionClass ?? "PARTNERSHIP",
    domainId: input.domainId ?? "domain:brand-partnerships",
    objectiveRefs: input.objectives ?? ["objective:premium-positioning", "objective:relationship-depth"],
    constraintRefs: input.constraints ?? ["constraint:keegan-time"],
    resourceRefs: input.resources ?? ["resource:creative-capacity"],
    approvalClass: input.approvalClass ?? "KEEGAN_APPROVAL_REQUIRED",
    reversibility: input.reversibility ?? "PARTIALLY_REVERSIBLE",
    truthState: input.truthState ?? "KNOWN",
    observedAt: input.observedAt ?? "2026-09-09T00:00:00.000Z",
    evidenceRefs: [`evidence:context:${input.decisionId}`],
  };
}

test("surfaces an exact historical precedent without granting recommendation, preference, or causal authority", () => {
  const result = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [record({ id: "decision:prior", governanceState: "APPROVED" })],
    contexts: [context({ decisionId: "decision:prior" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "PRECEDENTS_AVAILABLE");
  assert.equal(result.precedents.length, 1);
  const precedent = result.precedents[0];
  assert.equal(precedent.matchClass, "EXACT_STRUCTURAL_MATCH");
  assert.equal(precedent.sharedAnchorCount, 4);
  assert.deepEqual(precedent.materialDifferences, []);
  assert.equal(precedent.historicalDecisionGovernanceState, "APPROVED");
  assert.equal(precedent.historicalOutcome.state, "RECORDED");
  assert.equal(precedent.causalClaim, "NOT_ESTABLISHED");
  assert.equal(precedent.personalPreferenceClaim, "NOT_ESTABLISHED");
  assert.equal(precedent.recommendationAuthority, "NONE");
  assert.equal(result.authority.recommendationAllowed, false);
  assert.equal(result.authority.personalPreferenceInferenceAllowed, false);
  assert.equal(result.authority.causalClaimAllowed, false);
  assert.equal(result.authority.policyPromotionAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("rejects superficial same-domain history when explicit structural anchors do not overlap", () => {
  const result = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [record({ id: "decision:superficial" })],
    contexts: [
      context({
        decisionId: "decision:superficial",
        objectives: ["objective:short-term-revenue"],
        constraints: ["constraint:cash"],
        resources: ["resource:ad-spend"],
      }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_COMPARABLE_PRECEDENT");
  assert.deepEqual(result.precedents, []);
});

test("orders exact structural matches ahead of partial multi-anchor matches without inventing a confidence score", () => {
  const result = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [record({ id: "decision:partial" }), record({ id: "decision:exact" })],
    contexts: [
      context({
        decisionId: "decision:partial",
        objectives: ["objective:premium-positioning", "objective:different"],
        constraints: ["constraint:keegan-time"],
        resources: ["resource:other"],
        reversibility: "REVERSIBLE",
      }),
      context({ decisionId: "decision:exact", observedAt: "2026-08-01T00:00:00.000Z" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.deepEqual(result.precedents.map((item) => item.decisionId), ["decision:exact", "decision:partial"]);
  assert.equal(result.precedents[1].matchClass, "MULTI_ANCHOR_MATCH");
  assert.deepEqual(result.precedents[1].materialDifferences, [
    "OBJECTIVES_DIFFER",
    "RESOURCES_DIFFER",
    "REVERSIBILITY_DIFFERS",
  ]);
  assert.equal("confidence" in result.precedents[0], false);
});

test("fails closed when the current decision context is inferred, unknown, stale, or conflicted", () => {
  for (const truthState of ["INFERRED", "UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const result = buildDecisionPrecedentReviewV1({
      query: query({ truthState }),
      records: [record({ id: "decision:prior" })],
      contexts: [context({ decisionId: "decision:prior" })],
      evaluatedAt: EVALUATED_AT,
    });

    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.deepEqual(result.precedents, []);
    assert.deepEqual(result.issues, [`QUERY_CONTEXT_${truthState}`]);
  }
});

test("withholds inferred, stale, conflicted, future, and unmatched historical context instead of guessing", () => {
  const result = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [
      record({ id: "decision:inferred" }),
      record({ id: "decision:stale" }),
      record({ id: "decision:conflicted" }),
      record({ id: "decision:future-context" }),
    ],
    contexts: [
      context({ decisionId: "decision:inferred", truthState: "INFERRED" }),
      context({ decisionId: "decision:stale", truthState: "STALE" }),
      context({ decisionId: "decision:conflicted", truthState: "CONFLICTED" }),
      context({ decisionId: "decision:future-context", observedAt: "2026-09-20T00:00:00.000Z" }),
      context({ decisionId: "decision:missing-record" }),
    ],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_COMPARABLE_PRECEDENT");
  assert.deepEqual(result.withheldDecisionIds, [
    "decision:conflicted",
    "decision:future-context",
    "decision:inferred",
    "decision:stale",
  ]);
  assert.deepEqual(result.unmatchedDecisionIds, ["decision:missing-record"]);
  assert.deepEqual(result.issues, [
    "CONTEXT_CONFLICTED",
    "CONTEXT_INFERRED",
    "CONTEXT_STALE",
    "DECISION_RECORD_UNMATCHED",
    "FUTURE_CONTEXT_WITHHELD",
  ]);
});

test("withholds a future recorded outcome from precedent evidence", () => {
  const result = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [record({ id: "decision:future", observedAt: "2026-09-20T00:00:00.000Z" })],
    contexts: [context({ decisionId: "decision:future" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_COMPARABLE_PRECEDENT");
  assert.deepEqual(result.precedents, []);
  assert.deepEqual(result.withheldDecisionIds, ["decision:future"]);
  assert.deepEqual(result.issues, ["FUTURE_OUTCOME_WITHHELD"]);
});

test("preserves a historical monetary observation without synthesizing expected value, ROI, or a price recommendation", () => {
  const result = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [
      record({
        id: "decision:money",
        observedValue: 7500000,
        unit: "USD_CENTS",
        attributionClass: "CORRELATIONAL",
      }),
    ],
    contexts: [context({ decisionId: "decision:money" })],
    evaluatedAt: EVALUATED_AT,
  });

  const precedent = result.precedents[0];
  assert.equal(precedent.historicalOutcome.value, 7500000);
  assert.equal(precedent.historicalOutcome.unit, "USD_CENTS");
  assert.equal(precedent.historicalOutcome.attributionClass, "CORRELATIONAL");
  assert.equal(precedent.causalClaim, "NOT_ESTABLISHED");
  assert.equal(result.authority.monetaryValueSynthesisAllowed, false);
  assert.match(result.limitations.join(" "), /never converted into a forecast, expected value, ROI, or price recommendation/i);
});

test("preserves expired decision governance as historical context rather than current authority", () => {
  const result = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [
      record({
        id: "decision:expired",
        governanceState: "APPROVED",
        validUntil: "2026-09-05T00:00:00.000Z",
      }),
    ],
    contexts: [context({ decisionId: "decision:expired" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.precedents[0].historicalDecisionReviewState, "REVIEW_REQUIRED");
  assert.equal(result.precedents[0].applicability, "HISTORICAL_CONTEXT_ONLY");
  assert.equal(result.precedents[0].recommendationAuthority, "NONE");
});

test("is deterministic, bounded, immutable, and rejects duplicate identity or insufficient query anchors", () => {
  const records = [record({ id: "decision:b" }), record({ id: "decision:a" })];
  const contexts = [
    context({ decisionId: "decision:b", observedAt: "2026-09-08T00:00:00.000Z" }),
    context({ decisionId: "decision:a", observedAt: "2026-09-08T00:00:00.000Z" }),
  ];

  const first = buildDecisionPrecedentReviewV1({
    query: query(),
    records,
    contexts,
    evaluatedAt: EVALUATED_AT,
    maxPrecedents: 1,
  });
  const second = buildDecisionPrecedentReviewV1({
    query: query(),
    records: [...records].reverse(),
    contexts: [...contexts].reverse(),
    evaluatedAt: EVALUATED_AT,
    maxPrecedents: 1,
  });

  assert.deepEqual(first.precedents.map((item) => item.decisionId), ["decision:a"]);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.precedents[0]), true);

  assert.throws(
    () =>
      buildDecisionPrecedentReviewV1({
        query: query(),
        records: [record({ id: "decision:duplicate" }), record({ id: "decision:duplicate" })],
        contexts: [],
        evaluatedAt: EVALUATED_AT,
      }),
    /Duplicate decision learning record/,
  );

  assert.throws(
    () =>
      buildDecisionPrecedentReviewV1({
        query: query({ objectiveRefs: [], constraintRefs: [], resourceRefs: ["resource:only-one"] }),
        records: [],
        contexts: [],
        evaluatedAt: EVALUATED_AT,
      }),
    /not contain enough explicit structural anchors/,
  );
});
