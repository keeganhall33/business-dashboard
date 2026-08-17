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
};

export type DecisionLearningRecordCardV1 = DecisionLearningRecordInputV1 & {
  dashboard_flags: {
    is_successful_prediction: boolean;
    is_missed_prediction: boolean;
    is_low_attribution: boolean;
    is_unknown_outcome: boolean;
    can_update_policy: boolean;
    learning_strength: LearningStrengthV1;
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
  };
};

export function learningStrengthFor(input: DecisionLearningRecordInputV1): LearningStrengthV1 {
  if (input.ATTRIBUTION_CONFIDENCE === "LOW") return "WEAK_SIGNAL_ONLY";
  if (input.ATTRIBUTION_CONFIDENCE === "UNKNOWN" || input.RESULT_VS_PREDICTION === "UNKNOWN") return "UNKNOWN";
  if (input.RESULT_VS_PREDICTION === "INCONCLUSIVE") return "DIRECTIONAL_LEARNING";
  if (input.ATTRIBUTION_CONFIDENCE === "MEDIUM") return "DIRECTIONAL_LEARNING";
  return "STRONG_CAUSAL_LEARNING";
}

export function toDecisionLearningRecordCard(input: DecisionLearningRecordInputV1): DecisionLearningRecordCardV1 {
  const learning_strength = learningStrengthFor(input);
  return {
    ...input,
    POLICY_UPDATE_CANDIDATE: learning_strength === "STRONG_CAUSAL_LEARNING" ? input.POLICY_UPDATE_CANDIDATE : null,
    dashboard_flags: {
      is_successful_prediction: input.RESULT_VS_PREDICTION === "WITHIN_RANGE",
      is_missed_prediction: input.RESULT_VS_PREDICTION === "MISSED_HIGH" || input.RESULT_VS_PREDICTION === "MISSED_LOW",
      is_low_attribution: input.ATTRIBUTION_CONFIDENCE === "LOW",
      is_unknown_outcome: input.OBSERVED_OUTCOME.value === null || input.RESULT_VS_PREDICTION === "UNKNOWN",
      can_update_policy: learning_strength === "STRONG_CAUSAL_LEARNING" && Boolean(input.POLICY_UPDATE_CANDIDATE),
      learning_strength
    }
  };
}

export function buildDecisionLearningSnapshot(
  inputs: DecisionLearningRecordInputV1[],
  generated_at = "2026-08-17T20:00:00.000Z"
): DecisionLearningSnapshotV1 {
  const cards = inputs.map(toDecisionLearningRecordCard);
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
      policy_update_candidates: cards.filter((card) => card.dashboard_flags.can_update_policy).length
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
