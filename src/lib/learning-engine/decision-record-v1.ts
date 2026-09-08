import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { RecommendationStatus } from "@/lib/intelligence/recommendation-contract";

export type LearningActionStatusV1 = Extract<
  RecommendationStatus,
  "recommended" | "approved" | "executed" | "measuring" | "successful" | "unsuccessful" | "inconclusive"
>;

export type AttributionConfidenceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type ResultVsPredictionV1 = "WITHIN_RANGE" | "MISSED_HIGH" | "MISSED_LOW" | "INCONCLUSIVE" | "UNKNOWN";
export type CalibrationErrorV1 = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type LearningStrengthV1 = "STRONG_CAUSAL_LEARNING" | "DIRECTIONAL_LEARNING" | "WEAK_SIGNAL_ONLY" | "UNKNOWN";
export type DecisionGovernanceReviewStateV1 = "DRAFT" | "REVIEWED" | "APPROVED";
export type DecisionReviewStateV1 = "CURRENT" | "REVIEW_REQUIRED" | "SUPERSEDED";

export type PredictedOutcomeRangeV1 = {
  metric: string;
  unit: "USD_CENTS" | "COUNT" | "PERCENT" | "UNKNOWN";
  low: number | null;
  expected: number | null;
  high: number | null;
  rationale: string[];
};

export type ObservedOutcomeV1 = {
  metric: string;
  value: number | null;
  unit: PredictedOutcomeRangeV1["unit"];
  observed_at: string | null;
  evidence_refs: string[];
  unknown_reason: string | null;
};

export type DecisionGovernanceV1 = {
  rationale: string;
  alternatives: string[];
  decision_actor: string;
  decision_at: string;
  approval_authority: string;
  review_state: DecisionGovernanceReviewStateV1;
  supporting_evidence_refs: string[];
  contradicting_evidence_refs: string[];
  valid_until: string | null;
  evidence_fingerprint: string | null;
  revisit_on_evidence_change: boolean;
  superseded_by_id: string | null;
};

export type DecisionReviewContextV1 = {
  as_of?: string;
  current_evidence_fingerprint?: string | null;
};

export type DecisionReviewEvaluationV1 = {
  state: DecisionReviewStateV1;
  reasons: Array<"VALIDITY_EXPIRED" | "EVIDENCE_CHANGED" | "SUPERSEDED">;
};

export type DecisionLearningRecordInputV1 = {
  id: string;
  recommendation_id: string;
  HYPOTHESIS: string;
  PREDICTED_OUTCOME_RANGE: PredictedOutcomeRangeV1;
  CONFIDENCE: ExplanationConfidence;
  KEY_ASSUMPTIONS: string[];
  SUCCESS_CRITERIA: string[];
  EVALUATION_WINDOW: { start: string; end: string };
  ACTION_STATUS: LearningActionStatusV1;
  OBSERVED_OUTCOME: ObservedOutcomeV1;
  ATTRIBUTION_CONFIDENCE: AttributionConfidenceV1;
  RESULT_VS_PREDICTION: ResultVsPredictionV1;
  LESSON: string;
  CALIBRATION_ERROR: CalibrationErrorV1;
  POLICY_UPDATE_CANDIDATE: string | null;
  DECISION_GOVERNANCE?: DecisionGovernanceV1;
};

export type DecisionLearningRecordCardV1 = DecisionLearningRecordInputV1 & {
  decision_review: DecisionReviewEvaluationV1 | null;
  dashboard_flags: {
    is_successful_prediction: boolean;
    is_missed_prediction: boolean;
    is_low_attribution: boolean;
    is_unknown_outcome: boolean;
    can_update_policy: boolean;
    learning_strength: LearningStrengthV1;
    needs_decision_review: boolean;
    is_superseded: boolean;
  };
};

export type DecisionLearningSnapshotV1 = {
  generated_at: string;
  data_mode: "FIXTURE_BASELINE";
  cards: DecisionLearningRecordCardV1[];
  summary: {
    total_records: number;
    successful_predictions: number;
    missed_predictions: number;
    low_attribution_outcomes: number;
    unknown_outcomes: number;
    policy_update_candidates: number;
    review_required_decisions: number;
    superseded_decisions: number;
  };
};

const DECISION_REVIEW_STATES = new Set<DecisionGovernanceReviewStateV1>(["DRAFT", "REVIEWED", "APPROVED"]);

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
}

function assertCanonicalTimestamp(value: unknown, label: string): asserts value is string {
  assertNonEmptyString(value, label);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
}

function assertStringList(value: unknown, label: string, { allowEmpty = false } = {}): asserts value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const seen = new Set<string>();
  for (const item of value) {
    assertNonEmptyString(item, `${label} item`);
    if (seen.has(item)) throw new Error(`${label} contains duplicate reference ${item}`);
    seen.add(item);
  }
}

export function validateDecisionGovernance(input: DecisionLearningRecordInputV1): DecisionGovernanceV1 | null {
  const governance = input.DECISION_GOVERNANCE;
  if (governance == null) return null;
  if (typeof governance !== "object" || Array.isArray(governance)) {
    throw new Error("DECISION_GOVERNANCE must be an object");
  }

  assertNonEmptyString(governance.rationale, "DECISION_GOVERNANCE.rationale");
  assertStringList(governance.alternatives, "DECISION_GOVERNANCE.alternatives");
  assertNonEmptyString(governance.decision_actor, "DECISION_GOVERNANCE.decision_actor");
  assertCanonicalTimestamp(governance.decision_at, "DECISION_GOVERNANCE.decision_at");
  assertNonEmptyString(governance.approval_authority, "DECISION_GOVERNANCE.approval_authority");

  if (!DECISION_REVIEW_STATES.has(governance.review_state)) {
    throw new Error("DECISION_GOVERNANCE.review_state is invalid");
  }

  assertStringList(governance.supporting_evidence_refs, "DECISION_GOVERNANCE.supporting_evidence_refs", { allowEmpty: true });
  assertStringList(governance.contradicting_evidence_refs, "DECISION_GOVERNANCE.contradicting_evidence_refs", { allowEmpty: true });
  if (governance.supporting_evidence_refs.length + governance.contradicting_evidence_refs.length === 0) {
    throw new Error("DECISION_GOVERNANCE requires at least one evidence reference");
  }

  const supporting = new Set(governance.supporting_evidence_refs);
  const duplicatedAcrossSides = governance.contradicting_evidence_refs.find((ref) => supporting.has(ref));
  if (duplicatedAcrossSides) {
    throw new Error(`Evidence reference ${duplicatedAcrossSides} cannot be both supporting and contradicting`);
  }

  if (governance.valid_until != null) {
    assertCanonicalTimestamp(governance.valid_until, "DECISION_GOVERNANCE.valid_until");
    if (Date.parse(governance.valid_until) < Date.parse(governance.decision_at)) {
      throw new Error("DECISION_GOVERNANCE.valid_until cannot precede decision_at");
    }
  }

  if (typeof governance.revisit_on_evidence_change !== "boolean") {
    throw new Error("DECISION_GOVERNANCE.revisit_on_evidence_change must be boolean");
  }
  if (governance.revisit_on_evidence_change) {
    assertNonEmptyString(governance.evidence_fingerprint, "DECISION_GOVERNANCE.evidence_fingerprint");
  } else if (governance.evidence_fingerprint != null) {
    assertNonEmptyString(governance.evidence_fingerprint, "DECISION_GOVERNANCE.evidence_fingerprint");
  }

  if (governance.superseded_by_id != null) {
    assertNonEmptyString(governance.superseded_by_id, "DECISION_GOVERNANCE.superseded_by_id");
    if (governance.superseded_by_id === input.id) {
      throw new Error("Decision cannot supersede itself");
    }
  }

  return governance;
}

export function decisionReviewStateFor(
  input: DecisionLearningRecordInputV1,
  context: DecisionReviewContextV1 = {}
): DecisionReviewEvaluationV1 | null {
  const governance = validateDecisionGovernance(input);
  if (!governance) return null;

  if (governance.superseded_by_id) {
    return { state: "SUPERSEDED", reasons: ["SUPERSEDED"] };
  }

  const asOf = context.as_of ?? governance.decision_at;
  assertCanonicalTimestamp(asOf, "decision review as_of");
  const reasons: DecisionReviewEvaluationV1["reasons"] = [];

  if (governance.valid_until && Date.parse(asOf) >= Date.parse(governance.valid_until)) {
    reasons.push("VALIDITY_EXPIRED");
  }

  const currentFingerprint = context.current_evidence_fingerprint;
  if (
    governance.revisit_on_evidence_change &&
    currentFingerprint != null &&
    currentFingerprint !== governance.evidence_fingerprint
  ) {
    assertNonEmptyString(currentFingerprint, "current_evidence_fingerprint");
    reasons.push("EVIDENCE_CHANGED");
  }

  return {
    state: reasons.length > 0 ? "REVIEW_REQUIRED" : "CURRENT",
    reasons
  };
}

function validateSupersessionGraph(inputs: DecisionLearningRecordInputV1[]) {
  const byId = new Map<string, DecisionLearningRecordInputV1>();
  for (const input of inputs) {
    assertNonEmptyString(input.id, "decision id");
    if (byId.has(input.id)) throw new Error(`Duplicate decision id ${input.id}`);
    validateDecisionGovernance(input);
    byId.set(input.id, input);
  }

  for (const input of inputs) {
    const successor = input.DECISION_GOVERNANCE?.superseded_by_id;
    if (successor && !byId.has(successor)) {
      throw new Error(`Superseding decision ${successor} is missing`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Circular decision supersession is not allowed");
    if (visited.has(id)) return;
    visiting.add(id);
    const next = byId.get(id)?.DECISION_GOVERNANCE?.superseded_by_id;
    if (next) visit(next);
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of byId.keys()) visit(id);
}

export function learningStrengthFor(input: DecisionLearningRecordInputV1): LearningStrengthV1 {
  if (input.ATTRIBUTION_CONFIDENCE === "LOW") return "WEAK_SIGNAL_ONLY";
  if (input.ATTRIBUTION_CONFIDENCE === "UNKNOWN" || input.RESULT_VS_PREDICTION === "UNKNOWN") return "UNKNOWN";
  if (input.RESULT_VS_PREDICTION === "INCONCLUSIVE") return "DIRECTIONAL_LEARNING";
  if (input.ATTRIBUTION_CONFIDENCE === "MEDIUM") return "DIRECTIONAL_LEARNING";
  return "STRONG_CAUSAL_LEARNING";
}

export function toDecisionLearningRecordCard(
  input: DecisionLearningRecordInputV1,
  reviewContext: DecisionReviewContextV1 = {}
): DecisionLearningRecordCardV1 {
  const learning_strength = learningStrengthFor(input);
  const decision_review = decisionReviewStateFor(input, reviewContext);
  const governanceAllowsPolicyUpdate =
    !input.DECISION_GOVERNANCE ||
    (input.DECISION_GOVERNANCE.review_state === "APPROVED" && decision_review?.state === "CURRENT");
  const canUpdatePolicy =
    learning_strength === "STRONG_CAUSAL_LEARNING" &&
    Boolean(input.POLICY_UPDATE_CANDIDATE) &&
    governanceAllowsPolicyUpdate;

  return {
    ...input,
    POLICY_UPDATE_CANDIDATE: canUpdatePolicy ? input.POLICY_UPDATE_CANDIDATE : null,
    decision_review,
    dashboard_flags: {
      is_successful_prediction: input.RESULT_VS_PREDICTION === "WITHIN_RANGE",
      is_missed_prediction: input.RESULT_VS_PREDICTION === "MISSED_HIGH" || input.RESULT_VS_PREDICTION === "MISSED_LOW",
      is_low_attribution: input.ATTRIBUTION_CONFIDENCE === "LOW",
      is_unknown_outcome: input.OBSERVED_OUTCOME.value === null || input.RESULT_VS_PREDICTION === "UNKNOWN",
      can_update_policy: canUpdatePolicy,
      learning_strength,
      needs_decision_review: decision_review?.state === "REVIEW_REQUIRED",
      is_superseded: decision_review?.state === "SUPERSEDED"
    }
  };
}

export function buildDecisionLearningSnapshot(
  inputs: DecisionLearningRecordInputV1[],
  generated_at = "2026-08-17T20:00:00.000Z",
  reviewContext: DecisionReviewContextV1 = {}
): DecisionLearningSnapshotV1 {
  assertCanonicalTimestamp(generated_at, "generated_at");
  validateSupersessionGraph(inputs);
  const effectiveReviewContext = { as_of: generated_at, ...reviewContext };
  const cards = inputs.map((input) => toDecisionLearningRecordCard(input, effectiveReviewContext));
  return {
    generated_at,
    data_mode: "FIXTURE_BASELINE",
    cards,
    summary: {
      total_records: cards.length,
      successful_predictions: cards.filter((card) => card.dashboard_flags.is_successful_prediction).length,
      missed_predictions: cards.filter((card) => card.dashboard_flags.is_missed_prediction).length,
      low_attribution_outcomes: cards.filter((card) => card.dashboard_flags.is_low_attribution).length,
      unknown_outcomes: cards.filter((card) => card.dashboard_flags.is_unknown_outcome).length,
      policy_update_candidates: cards.filter((card) => card.dashboard_flags.can_update_policy).length,
      review_required_decisions: cards.filter((card) => card.dashboard_flags.needs_decision_review).length,
      superseded_decisions: cards.filter((card) => card.dashboard_flags.is_superseded).length
    }
  };
}

export const decisionLearningFixturesV1: DecisionLearningRecordInputV1[] = [
  {
    id: "learn-success-traffic-quality-001",
    recommendation_id: "rec_traffic_driver",
    HYPOTHESIS: "Restoring qualified traffic to the best-converting funnel will recover revenue without lowering conversion rate.",
    PREDICTED_OUTCOME_RANGE: {
      metric: "incremental_revenue_cents",
      unit: "USD_CENTS",
      low: 9000,
      expected: 15000,
      high: 22000,
      rationale: ["Traffic was the primary driver.", "Conversion quality remained stable in the baseline."]
    },
    CONFIDENCE: "likely",
    KEY_ASSUMPTIONS: ["Traffic source remains qualified.", "No stockout or checkout issue appears during the window."],
    SUCCESS_CRITERIA: ["Revenue lift lands within the predicted range.", "Conversion rate does not decline materially."],
    EVALUATION_WINDOW: { start: "2026-08-01", end: "2026-08-07" },
    ACTION_STATUS: "successful",
    OBSERVED_OUTCOME: {
      metric: "incremental_revenue_cents",
      value: 16250,
      unit: "USD_CENTS",
      observed_at: "2026-08-08T12:00:00.000Z",
      evidence_refs: ["ev_woo_revenue_window", "ev_ga4_qualified_sessions"],
      unknown_reason: null
    },
    ATTRIBUTION_CONFIDENCE: "HIGH",
    RESULT_VS_PREDICTION: "WITHIN_RANGE",
    LESSON: "When traffic quality is stable, the traffic-driver recommendation can be trusted within a conservative range.",
    CALIBRATION_ERROR: "LOW",
    POLICY_UPDATE_CANDIDATE: "Keep conservative traffic recovery ranges for similar qualified-session drops."
  },
  {
    id: "learn-missed-email-blindspot-002",
    recommendation_id: "rec_email_blocker",
    HYPOTHESIS: "Connecting email telemetry will explain the revenue drop and reveal a recoverable lifecycle gap.",
    PREDICTED_OUTCOME_RANGE: {
      metric: "explained_revenue_gap_percent",
      unit: "PERCENT",
      low: 25,
      expected: 40,
      high: 60,
      rationale: ["Email was missing from the explanation.", "Lifecycle revenue can materially alter attribution."]
    },
    CONFIDENCE: "possible",
    KEY_ASSUMPTIONS: ["Email had enough volume in the window.", "Campaign/flow data maps cleanly to revenue timing."],
    SUCCESS_CRITERIA: ["Email telemetry explains at least 25% of the gap.", "A specific lifecycle fix becomes measurable."],
    EVALUATION_WINDOW: { start: "2026-08-03", end: "2026-08-10" },
    ACTION_STATUS: "unsuccessful",
    OBSERVED_OUTCOME: {
      metric: "explained_revenue_gap_percent",
      value: 8,
      unit: "PERCENT",
      observed_at: "2026-08-11T12:00:00.000Z",
      evidence_refs: ["ev_email_export_partial", "ev_woo_revenue_window"],
      unknown_reason: null
    },
    ATTRIBUTION_CONFIDENCE: "MEDIUM",
    RESULT_VS_PREDICTION: "MISSED_LOW",
    LESSON: "Missing email telemetry was a data-quality issue, but it was not the main driver in this window.",
    CALIBRATION_ERROR: "MEDIUM",
    POLICY_UPDATE_CANDIDATE: null
  },
  {
    id: "learn-low-attribution-meta-003",
    recommendation_id: "rec_measurement_first",
    HYPOTHESIS: "A small paid-media adjustment should improve qualified sessions without reducing profit.",
    PREDICTED_OUTCOME_RANGE: {
      metric: "incremental_profit_cents",
      unit: "USD_CENTS",
      low: 3000,
      expected: 7000,
      high: 12000,
      rationale: ["Meta delivery improved.", "Prior sessions suggested some qualified traffic response."]
    },
    CONFIDENCE: "possible",
    KEY_ASSUMPTIONS: ["Meta attribution can be reconciled against commerce data.", "No overlapping organic campaign dominates the window."],
    SUCCESS_CRITERIA: ["Profit lands above the low bound.", "Attribution is defensible enough to learn from the result."],
    EVALUATION_WINDOW: { start: "2026-08-05", end: "2026-08-12" },
    ACTION_STATUS: "inconclusive",
    OBSERVED_OUTCOME: {
      metric: "incremental_profit_cents",
      value: null,
      unit: "USD_CENTS",
      observed_at: null,
      evidence_refs: ["ev_meta_delivery_snapshot", "ev_woo_attribution_counterpoint"],
      unknown_reason: "Meta delivery is visible, but purchase attribution conflicts with commerce-source evidence."
    },
    ATTRIBUTION_CONFIDENCE: "LOW",
    RESULT_VS_PREDICTION: "UNKNOWN",
    LESSON: "Treat the paid-media result as a weak signal only; do not update causal policy until attribution is defensible.",
    CALIBRATION_ERROR: "UNKNOWN",
    POLICY_UPDATE_CANDIDATE: "Do not apply: low attribution confidence blocks policy learning."
  }
];

export const decisionLearningSnapshotFixtureV1 = buildDecisionLearningSnapshot(decisionLearningFixturesV1);
