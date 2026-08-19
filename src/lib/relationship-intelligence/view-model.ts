import {
  RELATIONSHIP_INTELLIGENCE_VIEW_VERSION_V1,
  orderChampionCandidatesV1,
  type RelationshipOpportunityBriefV1,
  type RelationshipOpportunityViewModelV1
} from "./contracts";

export function toRelationshipOpportunityViewModelV1(brief: RelationshipOpportunityBriefV1): RelationshipOpportunityViewModelV1 {
  const ladder = orderChampionCandidatesV1(brief.CHAMPION_CANDIDATES);
  const likely = ladder[0];
  if (!likely) throw new Error("RELATIONSHIP_INTELLIGENCE_EMPTY_CHAMPION_LADDER");

  return {
    view_version: RELATIONSHIP_INTELLIGENCE_VIEW_VERSION_V1,
    brief_id: brief.brief_id,
    target_label: brief.TARGET.label,
    likely_champion: {
      candidate_id: likely.candidate_id,
      name: likely.name,
      confidence: likely.confidence,
      why: likely.why_candidate
    },
    champion_ladder: ladder.map((candidate, index) => ({
      candidate_id: candidate.candidate_id,
      name: candidate.name,
      rank: index + 1,
      evidence_quality: candidate.evidence_quality,
      relationship_edge_state: candidate.relationship_edge_state,
      strategic_fit_signal: candidate.strategic_fit_signal,
      mutual_value_signal: candidate.mutual_value_signal,
      access_path_signal: candidate.access_path_signal,
      confidence: candidate.confidence
    })),
    unknown_gaps: [...brief.UNKNOWN_GAPS],
    next_safe_action: brief.NEXT_SAFE_ACTION.action,
    approval_class: brief.APPROVAL_CLASS,
    keegan_action_required: "NO"
  };
}
