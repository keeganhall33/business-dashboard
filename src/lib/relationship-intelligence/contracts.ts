import type { ActionLevel } from "@/lib/actions/action-contract";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";

export const RELATIONSHIP_INTELLIGENCE_VERSION_V1 = "relationship_intelligence_v1.0" as const;
export const RELATIONSHIP_INTELLIGENCE_VIEW_VERSION_V1 = "relationship_intelligence_view_v1.0" as const;

export type RelationshipTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "CONFLICTED";
export type RelationshipEvidenceQualityV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type ChampionSignalLevelV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type RelationshipRiskLevelV1 = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type RelationshipTimingV1 = "NOW" | "THIS_MONTH" | "WATCH" | "WAIT" | "UNKNOWN";
export type ChampionCandidateKindV1 = "DECISION_MAKER" | "INTERNAL_CHAMPION" | "BRIDGE" | "UNKNOWN";

export type RelationshipEvidenceRefV1 = {
  ref_id: string;
  label: string;
  source: "public_fixture" | "strategy_fixture" | "manual_fixture";
  truth_state: RelationshipTruthStateV1;
  quality: RelationshipEvidenceQualityV1;
  notes: string;
};

export type ChampionCandidateV1 = {
  candidate_id: string;
  name: string;
  role_or_public_context: string;
  candidate_kind: ChampionCandidateKindV1;
  title_authority_signal: ChampionSignalLevelV1;
  relationship_edge_state: RelationshipTruthStateV1;
  evidence_quality: RelationshipEvidenceQualityV1;
  strategic_fit_signal: ChampionSignalLevelV1;
  mutual_value_signal: ChampionSignalLevelV1;
  access_path_signal: ChampionSignalLevelV1;
  confidence: ExplanationConfidence;
  why_candidate: string;
  evidence_refs: string[];
  unknowns: string[];
};

export type RelationshipOpportunityBriefV1 = {
  contract_version: typeof RELATIONSHIP_INTELLIGENCE_VERSION_V1;
  brief_id: string;
  generated_at: string;
  source_mode: "DETERMINISTIC_FIXTURE";
  TARGET: {
    target_id: string;
    label: string;
    strategic_target_type: "COMPANY" | "MEDIA_PLATFORM" | "COLLABORATION_SURFACE";
    why_it_matters: string;
  };
  DECISION_MAKER: {
    name: string;
    role_or_public_context: string;
    evidence_refs: string[];
    truth_state: RelationshipTruthStateV1;
  };
  CHAMPION_CANDIDATES: ChampionCandidateV1[];
  RELATIONSHIP_EVIDENCE: RelationshipEvidenceRefV1[];
  ACCESS_PATH: {
    summary: string;
    truth_state: RelationshipTruthStateV1;
    evidence_refs: string[];
  };
  STRATEGIC_UPSIDE: {
    summary: string;
    confidence: ExplanationConfidence;
    qualitative_only: true;
  };
  MUTUAL_VALUE: {
    summary: string;
    evidence_refs: string[];
    reciprocity_strength: ChampionSignalLevelV1;
  };
  RELATIONSHIP_RISK: {
    level: RelationshipRiskLevelV1;
    over_asking_guardrail: string;
    weak_reciprocity_guardrail: string;
  };
  TIMING: {
    state: RelationshipTimingV1;
    rationale: string;
  };
  UNKNOWN_GAPS: string[];
  NEXT_SAFE_ACTION: {
    action: string;
    rationale: string;
    external_write_allowed: false;
  };
  APPROVAL_CLASS: ActionLevel;
  WHAT_WOULD_CHANGE_THE_RANKING: string[];
};

export type RelationshipOpportunityViewModelV1 = {
  view_version: typeof RELATIONSHIP_INTELLIGENCE_VIEW_VERSION_V1;
  brief_id: string;
  target_label: string;
  likely_champion: {
    candidate_id: string;
    name: string;
    confidence: ExplanationConfidence;
    why: string;
  };
  champion_ladder: Array<{
    candidate_id: string;
    name: string;
    rank: number;
    evidence_quality: RelationshipEvidenceQualityV1;
    relationship_edge_state: RelationshipTruthStateV1;
    strategic_fit_signal: ChampionSignalLevelV1;
    mutual_value_signal: ChampionSignalLevelV1;
    access_path_signal: ChampionSignalLevelV1;
    confidence: ExplanationConfidence;
  }>;
  unknown_gaps: string[];
  next_safe_action: string;
  approval_class: ActionLevel;
  keegan_action_required: "NO";
};

const signalRank: Record<ChampionSignalLevelV1, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0
};

const evidenceRank: Record<RelationshipEvidenceQualityV1, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0
};

const truthRank: Record<RelationshipTruthStateV1, number> = {
  KNOWN: 3,
  INFERRED: 2,
  UNKNOWN: 0,
  CONFLICTED: -1
};

export function championLadderDimensionsV1(candidate: ChampionCandidateV1): number[] {
  return [
    evidenceRank[candidate.evidence_quality],
    truthRank[candidate.relationship_edge_state],
    signalRank[candidate.strategic_fit_signal],
    signalRank[candidate.mutual_value_signal],
    signalRank[candidate.access_path_signal],
    signalRank[candidate.title_authority_signal]
  ];
}

export function orderChampionCandidatesV1(candidates: ChampionCandidateV1[]): ChampionCandidateV1[] {
  return [...candidates].sort((a, b) => {
    const left = championLadderDimensionsV1(a);
    const right = championLadderDimensionsV1(b);
    for (let index = 0; index < left.length; index += 1) {
      const delta = right[index] - left[index];
      if (delta !== 0) return delta;
    }
    return a.candidate_id.localeCompare(b.candidate_id);
  });
}
