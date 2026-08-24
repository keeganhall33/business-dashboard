import { UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1 } from "@/lib/decision-intelligence/uncertainty/fixtures";
import { buildDecisionAlternativesComparisonViewModelV1 } from "./adapter";

export const DECISION_ALTERNATIVES_COMPARISON_FIXTURES_V1 = UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1.map(buildDecisionAlternativesComparisonViewModelV1);
