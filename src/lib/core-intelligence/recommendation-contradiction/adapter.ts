import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import type {
  RecommendationContradictionAssessmentV1,
  RecommendationContradictionFindingV1,
  RecommendationContradictionInputV1
} from "./contracts";

const PAUSE_CATEGORIES = new Set(["pause", "do_nothing", "measurement"]);
const EXPANSION_CATEGORIES = new Set(["scale", "pricing_experiment", "collector_outreach", "lead_follow_up", "partnership"]);

function intersects(left: string[], right: string[]) {
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.some((item) => rightSet.has(item.toLowerCase()));
}

function pairKey(left: Recommendation, right: Recommendation): [string, string] {
  return [left.id, right.id];
}

function hasUnknowns(rec: Recommendation) {
  const unknowns: RecommendationContradictionAssessmentV1["UNKNOWN"] = [];

  if (rec.estimated_cost.money_cents == null) {
    unknowns.push({ recommendation_id: rec.id, field: "cost", reason: "Estimated cost is UNKNOWN; resource conflict cannot be priced precisely." });
  }
  if (rec.estimated_effort.hours == null) {
    unknowns.push({ recommendation_id: rec.id, field: "effort", reason: "Estimated effort hours are UNKNOWN; capacity conflict cannot be quantified precisely." });
  }
  if (rec.time_to_impact === "unknown" || rec.review_date == null) {
    unknowns.push({ recommendation_id: rec.id, field: "timing", reason: "Timing or review date is UNKNOWN; sequencing conflict cannot be proven." });
  }
  if (rec.supporting_evidence.length === 0 || rec.confidence === "insufficient_evidence") {
    unknowns.push({ recommendation_id: rec.id, field: "evidence", reason: "Supporting evidence is missing or insufficient." });
  }
  if (rec.assumptions.length === 0) {
    unknowns.push({ recommendation_id: rec.id, field: "assumptions", reason: "Assumptions are not explicit enough to compare safely." });
  }

  return unknowns;
}

function objectiveConflict(left: Recommendation, right: Recommendation): RecommendationContradictionFindingV1 | null {
  const sameChannelOrAudience = intersects(left.affected_channels, right.affected_channels) || intersects(left.affected_audiences, right.affected_audiences);
  const opposedCategories =
    (PAUSE_CATEGORIES.has(left.category) && EXPANSION_CATEGORIES.has(right.category)) ||
    (EXPANSION_CATEGORIES.has(left.category) && PAUSE_CATEGORIES.has(right.category));

  if (!sameChannelOrAudience || !opposedCategories) return null;

  return {
    axis: "OBJECTIVE",
    recommendation_ids: pairKey(left, right),
    truth_state: "CONFLICTED",
    REVIEW_REQUIRED: true,
    conflict_summary: "Recommendations pursue opposing objectives on the same channel or audience.",
    evidence: [
      `${left.id}: ${left.category} / ${left.recommended_action}`,
      `${right.id}: ${right.category} / ${right.recommended_action}`
    ],
    prior_rationale_preserved: true
  };
}

function resourceConflict(left: Recommendation, right: Recommendation): RecommendationContradictionFindingV1 | null {
  const sharedScope =
    intersects(left.affected_channels, right.affected_channels) ||
    intersects(left.affected_products, right.affected_products) ||
    intersects(left.affected_audiences, right.affected_audiences);
  const expensive = (left.estimated_cost.money_cents ?? 0) > 0 && (right.estimated_cost.money_cents ?? 0) > 0;
  const heavyEffort = left.estimated_effort.level === "high" || right.estimated_effort.level === "high";

  if (!sharedScope || (!expensive && !heavyEffort)) return null;

  return {
    axis: "RESOURCE_USE",
    recommendation_ids: pairKey(left, right),
    truth_state: "CONFLICTED",
    REVIEW_REQUIRED: true,
    conflict_summary: "Recommendations compete for the same product/channel/audience resources.",
    evidence: [
      `${left.id}: cost=${left.estimated_cost.money_cents ?? "UNKNOWN"} effort=${left.estimated_effort.level}`,
      `${right.id}: cost=${right.estimated_cost.money_cents ?? "UNKNOWN"} effort=${right.estimated_effort.level}`
    ],
    prior_rationale_preserved: true
  };
}

function timingConflict(left: Recommendation, right: Recommendation): RecommendationContradictionFindingV1 | null {
  const sameScope = intersects(left.affected_channels, right.affected_channels) || intersects(left.affected_audiences, right.affected_audiences);
  const bothUrgent = left.urgency === "high" && right.urgency === "high";
  const oneSlow = left.time_to_impact === "weeks" || right.time_to_impact === "weeks";

  if (!sameScope || !bothUrgent || !oneSlow) return null;

  return {
    axis: "TIMING",
    recommendation_ids: pairKey(left, right),
    truth_state: "CONFLICTED",
    REVIEW_REQUIRED: true,
    conflict_summary: "Both recommendations claim high urgency, but at least one has a weeks-long impact path on the same scope.",
    evidence: [
      `${left.id}: urgency=${left.urgency} time_to_impact=${left.time_to_impact}`,
      `${right.id}: urgency=${right.urgency} time_to_impact=${right.time_to_impact}`
    ],
    prior_rationale_preserved: true
  };
}

function evidenceAssumptionConflict(left: Recommendation, right: Recommendation): RecommendationContradictionFindingV1 | null {
  const leftText = [...left.assumptions, ...left.limitations, ...left.data_missing].join(" ").toLowerCase();
  const rightText = [...right.assumptions, ...right.limitations, ...right.data_missing].join(" ").toLowerCase();
  const directConflict =
    (leftText.includes("matchback required") && rightText.includes("matchback not required")) ||
    (rightText.includes("matchback required") && leftText.includes("matchback not required")) ||
    (leftText.includes("direct economics unknown") && rightText.includes("direct economics proven")) ||
    (rightText.includes("direct economics unknown") && leftText.includes("direct economics proven"));

  if (!directConflict) return null;

  return {
    axis: "EVIDENCE_ASSUMPTION",
    recommendation_ids: pairKey(left, right),
    truth_state: "CONFLICTED",
    REVIEW_REQUIRED: true,
    conflict_summary: "Recommendations depend on incompatible evidence assumptions.",
    evidence: [
      `${left.id}: ${[...left.assumptions, ...left.limitations, ...left.data_missing].join(" | ")}`,
      `${right.id}: ${[...right.assumptions, ...right.limitations, ...right.data_missing].join(" | ")}`
    ],
    prior_rationale_preserved: true
  };
}

function pairFindings(left: Recommendation, right: Recommendation) {
  return [
    objectiveConflict(left, right),
    resourceConflict(left, right),
    timingConflict(left, right),
    evidenceAssumptionConflict(left, right)
  ].filter((item): item is RecommendationContradictionFindingV1 => Boolean(item));
}

export function assessRecommendationContradictionsV1(input: RecommendationContradictionInputV1): RecommendationContradictionAssessmentV1 {
  const findings: RecommendationContradictionFindingV1[] = [];
  const compatiblePairs: RecommendationContradictionAssessmentV1["compatible_pairs"] = [];

  for (let i = 0; i < input.recommendations.length; i += 1) {
    for (let j = i + 1; j < input.recommendations.length; j += 1) {
      const left = input.recommendations[i]!;
      const right = input.recommendations[j]!;
      const pair = pairFindings(left, right);
      findings.push(...pair);
      if (pair.length === 0 && !hasUnknowns(left).length && !hasUnknowns(right).length) {
        compatiblePairs.push({
          recommendation_ids: pairKey(left, right),
          truth_state: intersects(left.affected_channels, right.affected_channels) ? "INFERRED" : "KNOWN",
          why: "No objective, resource, timing, or evidence-assumption contradiction was detected from explicit recommendation fields."
        });
      }
    }
  }

  const unknowns = input.recommendations.flatMap(hasUnknowns);

  return {
    contract_version: "recommendation_contradiction_v1",
    generated_at: input.generated_at,
    recommendation_count: input.recommendations.length,
    REVIEW_REQUIRED: findings.length > 0,
    WHAT_CONFLICTS: findings,
    WHY: findings.length > 0
      ? findings.map((finding) => `${finding.axis}: ${finding.conflict_summary}`)
      : ["No explicit contradiction was detected across current recommendation records."],
    UNKNOWN: unknowns,
    compatible_pairs: compatiblePairs,
    prior_rationale: input.recommendations.map((rec) => ({
      recommendation_id: rec.id,
      title: rec.title,
      recommended_action: rec.recommended_action,
      reason: rec.reason,
      confidence: rec.confidence,
      confidence_reasons: rec.confidence_reasons,
      assumptions: rec.assumptions,
      limitations: rec.limitations
    })),
    recommendation_snapshots: structuredClone(input.recommendations),
    mutation_performed: false,
    keegan_action_required: "NO"
  };
}
