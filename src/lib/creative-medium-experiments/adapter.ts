import type {
  CreativeExperimentConfidenceV1,
  CreativeExperimentOptionV1,
  CreativeExperimentOrderingV1,
  CreativeExperimentRankedOptionV1,
  CreativeExperimentReversibilityV1,
  CreativeExperimentShortlistV1,
  CreativeExperimentTruthStateV1
} from "./contracts";
import { CREATIVE_MEDIUM_EXPERIMENT_FIXTURES_V1 } from "./fixtures";

type ExperimentRankingOverridesV1 = Partial<Record<string, Partial<Pick<CreativeExperimentOptionV1, "learning_burden" | "capacity_required" | "reversibility">> & {
  differentiation_hypothesis_score?: number;
  market_evidence_confidence?: CreativeExperimentConfidenceV1;
  market_evidence_truth_state?: CreativeExperimentTruthStateV1;
}>>;

const burdenScore: Record<CreativeExperimentOptionV1["learning_burden"], number> = {
  LOW: 3,
  MEDIUM: 2,
  HIGH: 0,
  UNKNOWN: 1
};

const capacityScore: Record<CreativeExperimentOptionV1["capacity_required"], number> = {
  LOW: 3,
  MEDIUM: 2,
  HIGH: 0,
  UNKNOWN: 1
};

const reversibilityScore: Record<CreativeExperimentReversibilityV1, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 0,
  UNKNOWN: 1
};

const confidenceScore: Record<CreativeExperimentConfidenceV1, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0
};

const truthPenalty: Record<CreativeExperimentTruthStateV1, number> = {
  KNOWN: 0,
  INFERRED: 0,
  UNKNOWN: 2,
  STALE: 2,
  CONFLICTED: 3
};

function differentiationScore(option: CreativeExperimentOptionV1, override?: number): number {
  if (typeof override === "number") return Math.max(0, Math.min(3, override));
  if (/signature|object authority|distinctive|intervention/i.test(option.differentiation_hypothesis)) return 3;
  if (/refinement|authority/i.test(option.differentiation_hypothesis)) return 2;
  return 1;
}

function withOverrides(option: CreativeExperimentOptionV1, overrides: ExperimentRankingOverridesV1): CreativeExperimentOptionV1 & { differentiation_hypothesis_score?: number } {
  const override = overrides[option.experiment_id];
  if (!override) return option;
  return {
    ...option,
    learning_burden: override.learning_burden ?? option.learning_burden,
    capacity_required: override.capacity_required ?? option.capacity_required,
    reversibility: override.reversibility ?? option.reversibility,
    differentiation_hypothesis_score: override.differentiation_hypothesis_score,
    market_evidence: {
      ...option.market_evidence,
      confidence: override.market_evidence_confidence ?? option.market_evidence.confidence,
      truth_state: override.market_evidence_truth_state ?? option.market_evidence.truth_state
    }
  };
}

function rankOption(option: CreativeExperimentOptionV1 & { differentiation_hypothesis_score?: number }): CreativeExperimentRankedOptionV1 {
  const breakdown = {
    learning_cost: burdenScore[option.learning_burden],
    differentiation: differentiationScore(option, option.differentiation_hypothesis_score),
    market_evidence: confidenceScore[option.market_evidence.confidence],
    institutional_fit: confidenceScore[option.institutional_fit.confidence],
    reversibility: reversibilityScore[option.reversibility],
    capacity_fit: capacityScore[option.capacity_required],
    unknown_penalty:
      truthPenalty[option.evidence_truth_state] +
      truthPenalty[option.market_evidence.truth_state] +
      truthPenalty[option.production_time_days_range.truth_state]
  };
  const score =
    breakdown.learning_cost +
    breakdown.differentiation +
    breakdown.market_evidence +
    breakdown.institutional_fit +
    breakdown.reversibility +
    breakdown.capacity_fit -
    breakdown.unknown_penalty;
  const ordering: CreativeExperimentOrderingV1 = score >= 15 ? "TEST_NOW" : score >= 8 ? "DEVELOP_NEXT" : "DEFER";

  return { ...option, ordering, rank: 0, score, score_breakdown: breakdown };
}

export function buildCreativeMediumExperimentShortlistV1(
  options: CreativeExperimentOptionV1[] = CREATIVE_MEDIUM_EXPERIMENT_FIXTURES_V1,
  overrides: ExperimentRankingOverridesV1 = {}
): CreativeExperimentShortlistV1 {
  const ranked = options
    .map((option) => rankOption(withOverrides(option, overrides)))
    .sort((left, right) => right.score - left.score || left.experiment_id.localeCompare(right.experiment_id))
    .map((option, index) => ({ ...option, rank: index + 1 }));

  return {
    contract_version: "creative_medium_experiment_shortlist_v1",
    generated_at: "2026-08-25T00:00:00.000Z",
    options: ranked,
    dashboard_projection: {
      TEST_NOW: ranked.filter((option) => option.ordering === "TEST_NOW").map((option) => option.experiment_id),
      DEVELOP_NEXT: ranked.filter((option) => option.ordering === "DEVELOP_NEXT").map((option) => option.experiment_id),
      DEFER: ranked.filter((option) => option.ordering === "DEFER").map((option) => option.experiment_id),
      WHAT_CHANGED: "Medium shifts are framed as small reversible experiments instead of a major pivot.",
      WHY_IT_MATTERS: "Keegan can protect graphite authority while learning whether a material, color, or dimensional move adds premium differentiation.",
      WHAT_TO_VERIFY_NEXT: [
        "Does serious response improve versus a graphite-only control?",
        "Does the audience cite graphite mastery first?",
        "Can the experiment fit current creative capacity without delaying core work?"
      ]
    }
  };
}
