import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionLearningRecordInputV1 } from "../../src/lib/learning-engine/decision-record-v1";
import {
  reviewDecisionRationaleRevisitV1,
  type DecisionRationaleAssumptionAssessmentV1,
  type DecisionRationaleEvidenceChangeV1,
} from "../../src/lib/learning-engine/decision-rationale-revisit-review-v1";

const EVALUATED_AT = "2026-09-19T15:30:00.000Z";
const ASSUMPTION = "The partner still values a premium positioning path.";

function decision(overrides: Partial<DecisionLearningRecordInputV1> = {}): DecisionLearningRecordInputV1 {
  return {
    id: "decision:partner-structure",
    recommendation_id: "recommendation:partner-structure",
    HYPOTHESIS: "A bounded premium structure could preserve strategic upside.",
    PREDICTED_OUTCOME_RANGE: {
      metric: "qualified_partner_progress",
      unit: "COUNT",
      low: 0,
      expected: 1,
      high: 1,
      rationale: ["Recorded forecast context only."],
    },
    CONFIDENCE: "medium",
    KEY_ASSUMPTIONS: [ASSUMPTION],
    SUCCESS_CRITERIA: ["A qualified next step is observed."],
    EVALUATION_WINDOW: {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z",
    },
    ACTION_STATUS: "approved",
    OBSERVED_OUTCOME: {
      metric: "qualified_partner_progress",
      value: null,
      unit: "COUNT",
      observed_at: null,
      evidence_refs: [],
      unknown_reason: "Outcome window is still open.",
    },
    ATTRIBUTION_CONFIDENCE: "UNKNOWN",
    ATTRIBUTION_CLASS: "NOT_ESTABLISHED",
    RESULT_VS_PREDICTION: "UNKNOWN",
    LESSON: "No outcome-backed lesson is established.",
    CALIBRATION_ERROR: "UNKNOWN",
    POLICY_UPDATE_CANDIDATE: null,
    DECISION_GOVERNANCE: {
      rationale: "Preserve premium positioning while keeping the next step reversible.",
      alternatives: ["Delay", "Decline"],
      decision_actor: "Keegan",
      decision_at: "2026-09-10T00:00:00.000Z",
      approval_authority: "Keegan",
      review_state: "APPROVED",
      supporting_evidence_refs: ["evidence:partner-interest"],
      contradicting_evidence_refs: [],
      valid_until: "2026-10-15T00:00:00.000Z",
      evidence_fingerprint: "fingerprint:v1",
      revisit_on_evidence_change: true,
      superseded_by_id: null,
    },
    ...overrides,
  };
}

function assessment(
  overrides: Partial<DecisionRationaleAssumptionAssessmentV1> = {},
): DecisionRationaleAssumptionAssessmentV1 {
  return {
    assumption: ASSUMPTION,
    state: "SUPPORTED",
    evidenceRefs: ["evidence:assumption-current"],
    sourceRefs: ["source:crm:partner-thread"],
    observedAt: "2026-09-19T14:00:00.000Z",
    truthState: "KNOWN",
    ...overrides,
  };
}

function change(
  overrides: Partial<DecisionRationaleEvidenceChangeV1> = {},
): DecisionRationaleEvidenceChangeV1 {
  return {
    changeId: "change:1",
    kind: "SUPPORTING_EVIDENCE_ADDED",
    evidenceRef: "evidence:new-support",
    sourceRef: "source:crm:new-support",
    observedAt: "2026-09-19T14:15:00.000Z",
    truthState: "KNOWN",
    note: "A new source-backed supporting observation was recorded.",
    ...overrides,
  };
}

function review(input: {
  record?: DecisionLearningRecordInputV1;
  fingerprint?: string | null;
  changes?: readonly DecisionRationaleEvidenceChangeV1[];
  assessments?: readonly DecisionRationaleAssumptionAssessmentV1[];
  maximumSourceAgeMs?: number;
}) {
  return reviewDecisionRationaleRevisitV1({
    decision: input.record ?? decision(),
    evaluatedAt: EVALUATED_AT,
    currentEvidenceFingerprint: input.fingerprint === undefined ? "fingerprint:v1" : input.fingerprint,
    maximumSourceAgeMs: input.maximumSourceAgeMs ?? 7 * 24 * 60 * 60 * 1000,
    evidenceChanges: input.changes ?? [],
    assumptionAssessments: input.assessments ?? [assessment()],
  });
}

test("keeps an approved rationale current only from fresh explicit evidence", () => {
  const result = review({ changes: [change()] });

  assert.equal(result.state, "CURRENT");
  assert.equal(result.sourceDecisionReviewState, "CURRENT");
  assert.ok(result.reasonCodes.includes("RATIONALE_CURRENT_ON_RECORDED_EVIDENCE"));
  assert.equal(result.recordedRationale, "Preserve premium positioning while keeping the next step reversible.");
  assert.deepEqual(result.unresolvedAssumptions, []);
  assert.deepEqual(result.contradictedAssumptions, []);
  assert.equal(result.recommendedDecision, null);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.authority.decisionMutationAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("requires rationale review when the canonical evidence fingerprint changes", () => {
  const result = review({ fingerprint: "fingerprint:v2" });

  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.equal(result.sourceDecisionReviewState, "REVIEW_REQUIRED");
  assert.ok(result.reasonCodes.includes("DECISION_EVIDENCE_FINGERPRINT_CHANGED"));
  assert.equal(result.nextInternalStep, "REVIEW_RECORDED_RATIONALE");
});

test("surfaces a contradicted recorded assumption without choosing a replacement decision", () => {
  const result = review({
    assessments: [assessment({ state: "CONTRADICTED", evidenceRefs: ["evidence:contradiction"] })],
  });

  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.ok(result.reasonCodes.includes("ASSUMPTION_CONTRADICTED"));
  assert.deepEqual(result.contradictedAssumptions, [ASSUMPTION]);
  assert.equal(result.recommendedDecision, null);
  assert.equal(result.inferredOutcome, null);
});

test("surfaces new contradicting evidence as a review trigger rather than a causal claim", () => {
  const result = review({
    changes: [change({ kind: "CONTRADICTING_EVIDENCE_ADDED" })],
  });

  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.ok(result.reasonCodes.includes("NEW_CONTRADICTING_EVIDENCE"));
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
});

test("fails closed on inferred, conflicted, stale, or future evidence", () => {
  for (const truthState of ["INFERRED", "UNKNOWN", "CONFLICTED", "STALE"] as const) {
    const result = review({ changes: [change({ truthState })] });
    assert.equal(result.state, "VERIFY_SOURCE");
    assert.ok(result.reasonCodes.includes("EVIDENCE_CHANGE_NOT_KNOWN"));
  }

  const stale = review({
    changes: [change({ observedAt: "2026-09-01T00:00:00.000Z" })],
    maximumSourceAgeMs: 24 * 60 * 60 * 1000,
  });
  assert.equal(stale.state, "VERIFY_SOURCE");
  assert.ok(stale.reasonCodes.includes("EVIDENCE_CHANGE_STALE"));

  const future = review({ changes: [change({ observedAt: "2026-09-20T00:00:00.000Z" })] });
  assert.equal(future.state, "VERIFY_SOURCE");
  assert.ok(future.reasonCodes.includes("FUTURE_EVIDENCE"));
});

test("fails closed when a recorded assumption has no current source-backed assessment", () => {
  const result = review({ assessments: [] });

  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.ok(result.reasonCodes.includes("ASSUMPTION_ASSESSMENT_MISSING"));
  assert.deepEqual(result.unresolvedAssumptions, [ASSUMPTION]);
});

test("preserves supersession instead of resurrecting an older rationale", () => {
  const base = decision();
  const record = decision({
    DECISION_GOVERNANCE: {
      ...base.DECISION_GOVERNANCE!,
      superseded_by_id: "decision:partner-structure-v2",
    },
  });
  const result = review({ record });

  assert.equal(result.state, "SUPERSEDED");
  assert.equal(result.sourceDecisionReviewState, "SUPERSEDED");
  assert.ok(result.reasonCodes.includes("DECISION_SUPERSEDED"));
  assert.equal(result.nextInternalStep, null);
});

test("fails closed when current fingerprint evidence is required but absent", () => {
  const result = review({ fingerprint: null });

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("CURRENT_EVIDENCE_FINGERPRINT_MISSING"));
});
