import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionLearningSnapshot,
  decisionLearningFixturesV1,
  decisionLearningSnapshotFixtureV1,
  decisionReviewStateFor,
  learningStrengthFor,
  toDecisionLearningRecordCard,
  validateDecisionGovernance,
  type DecisionGovernanceV1,
  type DecisionLearningRecordInputV1
} from "@/lib/learning-engine/decision-record-v1";

function governedRecord({
  id = "governed-decision-001",
  base = decisionLearningFixturesV1[0],
  governance = {}
}: {
  id?: string;
  base?: DecisionLearningRecordInputV1;
  governance?: Partial<DecisionGovernanceV1>;
} = {}): DecisionLearningRecordInputV1 {
  return {
    ...base,
    id,
    DECISION_GOVERNANCE: {
      rationale: "The evidence supports acting now while preserving a bounded reevaluation trigger.",
      alternatives: ["Defer and gather more evidence", "Run a smaller reversible test"],
      decision_actor: "Keegan",
      decision_at: "2026-08-15T12:00:00.000Z",
      approval_authority: "OWNER",
      review_state: "APPROVED",
      supporting_evidence_refs: ["ev_support_primary", "ev_support_secondary"],
      contradicting_evidence_refs: ["ev_counterpoint"],
      valid_until: "2026-09-15T12:00:00.000Z",
      evidence_fingerprint: "evidence-v1",
      revisit_on_evidence_change: true,
      superseded_by_id: null,
      ...governance
    }
  };
}

test("decision learning snapshot is dashboard-consumable and deterministic", () => {
  const snapshot = decisionLearningSnapshotFixtureV1;

  assert.equal(snapshot.data_mode, "FIXTURE_BASELINE");
  assert.equal(snapshot.summary.total_records, 3);
  assert.equal(snapshot.summary.successful_predictions, 1);
  assert.equal(snapshot.summary.missed_predictions, 1);
  assert.equal(snapshot.summary.low_attribution_outcomes, 1);
  assert.equal(snapshot.summary.unknown_outcomes, 1);
  assert.equal(snapshot.summary.policy_update_candidates, 0);
  assert.equal(snapshot.summary.review_required_decisions, 0);
  assert.equal(snapshot.summary.superseded_decisions, 0);

  assert.deepEqual(
    snapshot.cards.map((card) => card.RESULT_VS_PREDICTION),
    ["WITHIN_RANGE", "MISSED_LOW", "UNKNOWN"]
  );
});

test("successful observational prediction remains directional and cannot silently become causal policy", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[0]);

  assert.equal(card.dashboard_flags.is_successful_prediction, true);
  assert.equal(card.resolved_attribution_class, "CORRELATIONAL");
  assert.equal(card.dashboard_flags.learning_strength, "DIRECTIONAL_LEARNING");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
  assert.equal(card.CALIBRATION_ERROR, "LOW");
});

test("strong causal learning requires explicit causal support plus current approved governance", () => {
  const causal = governedRecord({
    id: "causal-governed",
    base: {
      ...decisionLearningFixturesV1[0],
      ATTRIBUTION_CLASS: "CAUSAL_SUPPORTED"
    }
  });
  const card = toDecisionLearningRecordCard(causal, {
    as_of: "2026-08-20T12:00:00.000Z",
    current_evidence_fingerprint: "evidence-v1"
  });

  assert.equal(card.resolved_attribution_class, "CAUSAL_SUPPORTED");
  assert.equal(card.ATTRIBUTION_CONFIDENCE, "HIGH");
  assert.equal(card.dashboard_flags.learning_strength, "STRONG_CAUSAL_LEARNING");
  assert.equal(card.dashboard_flags.can_update_policy, true);
  assert.match(card.POLICY_UPDATE_CANDIDATE ?? "", /conservative traffic recovery ranges/i);
});

test("legacy records without an attribution class fail closed instead of gaining causal status", () => {
  const legacy = {
    ...decisionLearningFixturesV1[0],
    ATTRIBUTION_CLASS: undefined
  } satisfies DecisionLearningRecordInputV1;
  const card = toDecisionLearningRecordCard(legacy);

  assert.equal(card.resolved_attribution_class, "NOT_ESTABLISHED");
  assert.equal(card.dashboard_flags.learning_strength, "DIRECTIONAL_LEARNING");
  assert.equal(card.dashboard_flags.can_update_policy, false);
});

test("missed prediction is visible without inventing a policy update", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[1]);

  assert.equal(card.dashboard_flags.is_missed_prediction, true);
  assert.equal(card.RESULT_VS_PREDICTION, "MISSED_LOW");
  assert.equal(card.CALIBRATION_ERROR, "MEDIUM");
  assert.equal(card.dashboard_flags.learning_strength, "DIRECTIONAL_LEARNING");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
});

test("low attribution outcomes cannot be represented as strong causal learning", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[2]);

  assert.equal(card.ATTRIBUTION_CONFIDENCE, "LOW");
  assert.equal(card.resolved_attribution_class, "NOT_ESTABLISHED");
  assert.equal(card.dashboard_flags.is_low_attribution, true);
  assert.equal(card.dashboard_flags.learning_strength, "WEAK_SIGNAL_ONLY");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
  assert.notEqual(learningStrengthFor(decisionLearningFixturesV1[2]), "STRONG_CAUSAL_LEARNING");
  assert.match(card.LESSON, /weak signal only/i);
});

test("UNKNOWN remains explicit for unresolved observed outcome", () => {
  const card = toDecisionLearningRecordCard(decisionLearningFixturesV1[2]);

  assert.equal(card.RESULT_VS_PREDICTION, "UNKNOWN");
  assert.equal(card.CALIBRATION_ERROR, "UNKNOWN");
  assert.equal(card.OBSERVED_OUTCOME.value, null);
  assert.match(card.OBSERVED_OUTCOME.unknown_reason ?? "", /conflicts with commerce-source evidence/i);
  assert.equal(card.dashboard_flags.is_unknown_outcome, true);
  assert.notEqual(card.RESULT_VS_PREDICTION, "NONE");
  assert.notEqual(card.RESULT_VS_PREDICTION, false);
  assert.notEqual(card.RESULT_VS_PREDICTION, null);
});

test("custom snapshot preserves action status, assumptions, success criteria, and evaluation window", () => {
  const snapshot = buildDecisionLearningSnapshot([decisionLearningFixturesV1[0]], "2026-08-17T21:00:00.000Z");
  const [card] = snapshot.cards;

  assert.equal(snapshot.generated_at, "2026-08-17T21:00:00.000Z");
  assert.equal(card.ACTION_STATUS, "successful");
  assert.ok(card.KEY_ASSUMPTIONS.length > 0);
  assert.ok(card.SUCCESS_CRITERIA.length > 0);
  assert.deepEqual(card.EVALUATION_WINDOW, { start: "2026-08-01", end: "2026-08-07" });
  assert.equal(card.PREDICTED_OUTCOME_RANGE.metric, card.OBSERVED_OUTCOME.metric);
});

test("governed decision preserves rationale alternatives authority and distinct evidence sides", () => {
  const input = governedRecord();
  const snapshot = buildDecisionLearningSnapshot(
    [input],
    "2026-08-20T12:00:00.000Z",
    { current_evidence_fingerprint: "evidence-v1" }
  );
  const [card] = snapshot.cards;

  assert.equal(card.DECISION_GOVERNANCE?.rationale, input.DECISION_GOVERNANCE?.rationale);
  assert.deepEqual(card.DECISION_GOVERNANCE?.alternatives, [
    "Defer and gather more evidence",
    "Run a smaller reversible test"
  ]);
  assert.equal(card.DECISION_GOVERNANCE?.decision_actor, "Keegan");
  assert.equal(card.DECISION_GOVERNANCE?.decision_at, "2026-08-15T12:00:00.000Z");
  assert.equal(card.DECISION_GOVERNANCE?.approval_authority, "OWNER");
  assert.deepEqual(card.DECISION_GOVERNANCE?.supporting_evidence_refs, ["ev_support_primary", "ev_support_secondary"]);
  assert.deepEqual(card.DECISION_GOVERNANCE?.contradicting_evidence_refs, ["ev_counterpoint"]);
  assert.equal(card.decision_review?.state, "CURRENT");
  assert.equal(card.dashboard_flags.needs_decision_review, false);
  assert.equal(card.OBSERVED_OUTCOME.value, input.OBSERVED_OUTCOME.value);
});

test("valid-until trigger remains current before boundary and requires review at boundary", () => {
  const input = governedRecord();

  assert.deepEqual(decisionReviewStateFor(input, { as_of: "2026-09-15T11:59:59.999Z" }), {
    state: "CURRENT",
    reasons: []
  });
  assert.deepEqual(decisionReviewStateFor(input, { as_of: "2026-09-15T12:00:00.000Z" }), {
    state: "REVIEW_REQUIRED",
    reasons: ["VALIDITY_EXPIRED"]
  });
});

test("evidence-change trigger is deterministic and does not fire for the same fingerprint", () => {
  const input = governedRecord();

  assert.equal(
    decisionReviewStateFor(input, {
      as_of: "2026-08-20T12:00:00.000Z",
      current_evidence_fingerprint: "evidence-v1"
    })?.state,
    "CURRENT"
  );
  assert.deepEqual(
    decisionReviewStateFor(input, {
      as_of: "2026-08-20T12:00:00.000Z",
      current_evidence_fingerprint: "evidence-v2"
    }),
    { state: "REVIEW_REQUIRED", reasons: ["EVIDENCE_CHANGED"] }
  );
});

test("superseded decision retains history and points to a valid successor", () => {
  const oldDecision = governedRecord({
    id: "decision-old",
    governance: { superseded_by_id: "decision-new" }
  });
  const newDecision = governedRecord({
    id: "decision-new",
    governance: {
      rationale: "Newer evidence materially changed the preferred move.",
      evidence_fingerprint: "evidence-v2"
    }
  });

  const snapshot = buildDecisionLearningSnapshot(
    [oldDecision, newDecision],
    "2026-08-20T12:00:00.000Z",
    { current_evidence_fingerprint: "evidence-v2" }
  );
  const oldCard = snapshot.cards.find((card) => card.id === "decision-old");

  assert.equal(oldCard?.decision_review?.state, "SUPERSEDED");
  assert.equal(oldCard?.DECISION_GOVERNANCE?.superseded_by_id, "decision-new");
  assert.match(oldCard?.DECISION_GOVERNANCE?.rationale ?? "", /evidence supports acting now/i);
  assert.equal(oldCard?.OBSERVED_OUTCOME.value, oldDecision.OBSERVED_OUTCOME.value);
  assert.equal(oldCard?.dashboard_flags.can_update_policy, false);
  assert.equal(snapshot.summary.superseded_decisions, 1);
});

test("governance cannot promote UNKNOWN or low-attribution outcomes into policy", () => {
  const weak = governedRecord({
    id: "weak-governed",
    base: {
      ...decisionLearningFixturesV1[2],
      POLICY_UPDATE_CANDIDATE: "Unsafe candidate that must remain blocked."
    }
  });
  const card = toDecisionLearningRecordCard(weak, {
    as_of: "2026-08-20T12:00:00.000Z",
    current_evidence_fingerprint: "evidence-v1"
  });

  assert.equal(card.ATTRIBUTION_CONFIDENCE, "LOW");
  assert.equal(card.RESULT_VS_PREDICTION, "UNKNOWN");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
});

test("unapproved review-required or ungoverned learning cannot update policy", () => {
  const causalBase = {
    ...decisionLearningFixturesV1[0],
    ATTRIBUTION_CLASS: "CAUSAL_SUPPORTED" as const
  };
  const ungoverned = causalBase;
  const reviewedOnly = governedRecord({ base: causalBase, governance: { review_state: "REVIEWED" } });
  const staleApproval = governedRecord({ base: causalBase, governance: { valid_until: "2026-08-18T12:00:00.000Z" } });

  assert.equal(
    toDecisionLearningRecordCard(ungoverned, { as_of: "2026-08-20T12:00:00.000Z" }).dashboard_flags.can_update_policy,
    false
  );
  assert.equal(
    toDecisionLearningRecordCard(reviewedOnly, { as_of: "2026-08-20T12:00:00.000Z" }).dashboard_flags.can_update_policy,
    false
  );
  assert.equal(
    toDecisionLearningRecordCard(staleApproval, { as_of: "2026-08-20T12:00:00.000Z" }).dashboard_flags.can_update_policy,
    false
  );
});

test("malformed governance fails closed for timestamps rationale evidence and review state", () => {
  const cases: Array<[string, DecisionLearningRecordInputV1, RegExp]> = [
    [
      "timestamp",
      governedRecord({ governance: { decision_at: "not-a-time" } }),
      /decision_at must be a canonical ISO timestamp/
    ],
    ["rationale", governedRecord({ governance: { rationale: " " } }), /rationale must be a non-empty string/],
    [
      "missing evidence",
      governedRecord({ governance: { supporting_evidence_refs: [], contradicting_evidence_refs: [] } }),
      /requires at least one evidence reference/
    ],
    [
      "conflicting evidence",
      governedRecord({ governance: { contradicting_evidence_refs: ["ev_support_primary"] } }),
      /cannot be both supporting and contradicting/
    ],
    [
      "review state",
      governedRecord({ governance: { review_state: "INVALID" as DecisionGovernanceV1["review_state"] } }),
      /review_state is invalid/
    ]
  ];

  for (const [label, input, expected] of cases) {
    assert.throws(() => validateDecisionGovernance(input), expected, label);
  }
});

test("invalid attribution class fails closed before snapshot promotion", () => {
  const invalid = {
    ...decisionLearningFixturesV1[0],
    ATTRIBUTION_CLASS: "ASSERTED_CAUSAL" as DecisionLearningRecordInputV1["ATTRIBUTION_CLASS"]
  };
  assert.throws(
    () => buildDecisionLearningSnapshot([invalid], "2026-08-20T12:00:00.000Z"),
    /ATTRIBUTION_CLASS is invalid/
  );
});

test("supersession fails closed for self reference missing successor and circular chains", () => {
  const self = governedRecord({ id: "self", governance: { superseded_by_id: "self" } });
  assert.throws(
    () => buildDecisionLearningSnapshot([self], "2026-08-20T12:00:00.000Z"),
    /cannot supersede itself/
  );

  const missing = governedRecord({ id: "old", governance: { superseded_by_id: "missing" } });
  assert.throws(
    () => buildDecisionLearningSnapshot([missing], "2026-08-20T12:00:00.000Z"),
    /Superseding decision missing is missing/
  );

  const first = governedRecord({ id: "first", governance: { superseded_by_id: "second" } });
  const second = governedRecord({ id: "second", governance: { superseded_by_id: "first" } });
  assert.throws(
    () => buildDecisionLearningSnapshot([first, second], "2026-08-20T12:00:00.000Z"),
    /Circular decision supersession is not allowed/
  );
});
