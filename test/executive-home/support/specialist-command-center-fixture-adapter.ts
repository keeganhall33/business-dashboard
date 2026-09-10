import { DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";
import {
  type SpecialistCommandCenterCardV1,
  type SpecialistProductionInputV1,
  toSpecialistEvidenceFreshnessV1
} from "@/lib/executive-home/specialist-command-center";
import { getFinancialIntelligenceFixtureBundleV1 } from "@/lib/financial-intelligence/fixtures";
import { toExecutiveGoalsCapacityViewModelV1 } from "@/lib/goals-portfolio-capacity/executive-view-model";
import { getGoalsPortfolioCapacityFixtureBundleV1 } from "@/lib/goals-portfolio-capacity/fixtures";
import { RELATIONSHIP_INTELLIGENCE_FIXTURES_V1 } from "@/lib/relationship-intelligence/fixtures";
import { toRelationshipOpportunityViewModelV1 } from "@/lib/relationship-intelligence/view-model";

export function getSpecialistCommandCenterCardsFixtureV1(): SpecialistCommandCenterCardV1[] {
  const financialBundle = getFinancialIntelligenceFixtureBundleV1();
  const financialSnapshot =
    financialBundle.snapshots.find((snapshot) => snapshot.coverage_state !== "COMPLETE") ?? financialBundle.snapshots[0];
  const financialRecommendation =
    financialBundle.recommendations.find((recommendation) => recommendation.stage === "DO_NOW") ?? financialBundle.recommendations[0];

  const goalsBundle = getGoalsPortfolioCapacityFixtureBundleV1();
  const goalsSnapshot =
    goalsBundle.snapshots.find((snapshot) => snapshot.ATTENTION_CAPACITY_LOAD.state !== "HEALTHY") ??
    goalsBundle.snapshots[0];
  const goalsView = toExecutiveGoalsCapacityViewModelV1(goalsSnapshot);

  const relationshipBrief = RELATIONSHIP_INTELLIGENCE_FIXTURES_V1[0];
  const relationshipView = toRelationshipOpportunityViewModelV1(relationshipBrief);

  return [
    {
      id: "financial",
      title: "Financial",
      what_changed: financialSnapshot.top_financial_change,
      why_it_matters: financialSnapshot.top_financial_risk,
      next_best_action: financialRecommendation?.next_step ?? financialSnapshot.next_best_action,
      confidence: financialSnapshot.confidence.level,
      truth_state: financialSnapshot.coverage_state === "COMPLETE" ? "KNOWN" : "UNKNOWN",
      evidence_freshness: toSpecialistEvidenceFreshnessV1(
        financialSnapshot.coverage_state === "COMPLETE" ? "KNOWN" : "UNKNOWN"
      ),
      evidence_context: {
        source_label: financialSnapshot.source,
        freshness_detail: "Direct financial evidence remains incomplete; freshness is UNKNOWN rather than assumed current.",
        truth_detail: financialSnapshot.key_uncertainty,
        last_updated: null
      },
      material_gap_or_risk: financialSnapshot.key_uncertainty,
      detail_href: "/specialists/financial",
      evidence:
        DECISION_ROOM_FIXTURE_V1.evidence_refs.find((ref) => ref.provenance === "FINANCIAL_FIXTURE")?.label ??
        financialSnapshot.source,
      decision_room_id: DECISION_ROOM_FIXTURE_V1.decision_id,
      approval_class: DECISION_ROOM_FIXTURE_V1.approval_class,
      source: financialSnapshot.source,
      source_mode: "FIXTURE"
    },
    {
      id: "goals-capacity",
      title: "Goals / Capacity",
      what_changed: goalsView.headline,
      why_it_matters: goalsView.overload_or_conflict.summary,
      next_best_action: goalsView.next_portfolio_action,
      confidence: goalsView.active_bets[0]?.confidence ?? "UNKNOWN",
      truth_state:
        goalsView.portfolio_state === "UNKNOWN"
          ? "UNKNOWN"
          : goalsView.overload_or_conflict.visible
            ? "INFERRED"
            : "KNOWN",
      evidence_freshness: toSpecialistEvidenceFreshnessV1(
        goalsView.portfolio_state === "UNKNOWN" ? "UNKNOWN" : "KNOWN"
      ),
      evidence_context: {
        source_label: goalsSnapshot.source,
        freshness_detail:
          goalsView.portfolio_state === "UNKNOWN"
            ? "Capacity evidence has UNKNOWN inputs."
            : "Portfolio pressure fixture is current for this read-only view.",
        truth_detail: goalsSnapshot.unknown_resource_inputs.join("; ") || goalsView.overload_or_conflict.summary,
        last_updated: null
      },
      material_gap_or_risk: goalsSnapshot.unknown_resource_inputs[0] ?? goalsView.overload_or_conflict.summary,
      detail_href: "/specialists/goals-capacity",
      evidence: "Goals fixture: " + goalsSnapshot.source,
      source: goalsSnapshot.source,
      source_mode: "FIXTURE"
    },
    {
      id: "relationships",
      title: "Relationships",
      what_changed:
        relationshipView.target_label + ": likely champion path is " + relationshipView.likely_champion.confidence + ".",
      why_it_matters: relationshipView.likely_champion.why,
      next_best_action: relationshipView.next_safe_action,
      confidence: relationshipView.likely_champion.confidence,
      truth_state: relationshipBrief.ACCESS_PATH.truth_state,
      evidence_freshness: toSpecialistEvidenceFreshnessV1(relationshipBrief.ACCESS_PATH.truth_state),
      evidence_context: {
        source_label: relationshipBrief.source_mode,
        freshness_detail:
          relationshipBrief.ACCESS_PATH.truth_state === "UNKNOWN"
            ? "Warm path freshness is UNKNOWN until a direct source confirms it."
            : "Relationship fixture source is current for this preview.",
        truth_detail: relationshipBrief.ACCESS_PATH.summary,
        last_updated: null
      },
      material_gap_or_risk: relationshipBrief.ACCESS_PATH.summary,
      detail_href: "/relationships",
      evidence: "Relationship fixture: " + relationshipBrief.source_mode,
      source: relationshipBrief.source_mode,
      source_mode: "FIXTURE"
    }
  ];
}

export function getSpecialistProductionInputFixtureV1(): SpecialistProductionInputV1 {
  return {
    source_mode: "PRODUCTION",
    cards: getSpecialistCommandCenterCardsFixtureV1().map((card) => ({
      ...card,
      evidence_context: { ...card.evidence_context },
      source_mode: "PRODUCTION"
    }))
  };
}
