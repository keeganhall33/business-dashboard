import type { ConversationInputClassificationV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import type { ApprovalLevel } from "@/lib/intelligence/recommendation-contract";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";

export type RevisionInputClassificationV1 = ConversationInputClassificationV1 | "DECISION_COMMITMENT";
export type RevisionTruthStateV1 = "KNOWN" | "UNKNOWN" | "CONFLICTED" | "ASSUMED" | "HYPOTHETICAL_ONLY";
export type RevisionUrgencyV1 = "LOW" | "MEDIUM" | "HIGH";
export type RevisionProvenanceKindV1 = "SYSTEM_EVIDENCE" | "HUMAN_REPORTED_FACT" | "HUMAN_JUDGMENT" | "CORRECTION" | "DECISION_COMMITMENT" | "HYPOTHETICAL";

export type RevisionProvenanceV1 = {
  source_id: string;
  source_label: string;
  kind: RevisionProvenanceKindV1;
  captured_at: string;
  actor: "SYSTEM" | "KEEGAN" | "JEEVES_FIXTURE";
  notes: string;
  memory_write_allowed: boolean;
};

export type RevisionEvidenceRefV1 = {
  evidence_id: string;
  label: string;
  provenance: RevisionProvenanceV1;
  truth_state: RevisionTruthStateV1;
  detail: string;
};

export type RevisionAssumptionV1 = {
  assumption_id: string;
  label: string;
  state: "OPEN" | "CONFIRMED" | "REJECTED" | "CONFLICTED";
  detail: string;
  evidence_refs: string[];
};

export type RecommendationRevisionVersionV1 = {
  recommendation_id: string;
  version: number;
  title: string;
  recommendation_summary: string;
  recommended_action: string;
  urgency: RevisionUrgencyV1;
  approval_level: ApprovalLevel;
  confidence: ExplanationConfidence;
  evidence_refs: RevisionEvidenceRefV1[];
  assumptions: RevisionAssumptionV1[];
  unknowns: string[];
  conflicts: string[];
  created_from_input_id: string;
};

export type RecommendationRevisionInputV1 = {
  input_id: string;
  recommendation_id: string;
  classification: RevisionInputClassificationV1;
  utterance: string;
  interpreted_claim: string | null;
  provenance: RevisionProvenanceV1;
  proposed_changes?: Partial<Pick<RecommendationRevisionVersionV1, "recommendation_summary" | "recommended_action" | "urgency" | "approval_level" | "confidence" | "unknowns" | "conflicts">> & {
    evidence_to_add?: RevisionEvidenceRefV1[];
    changed_assumptions?: RevisionAssumptionV1[];
    why_changed?: string[];
  };
};

export type RecommendationDecisionDiffV1 = {
  recommendation_id: string;
  previous_version: number;
  next_version: number;
  before: Pick<RecommendationRevisionVersionV1, "recommendation_summary" | "recommended_action" | "urgency" | "approval_level" | "confidence" | "unknowns" | "conflicts">;
  after: Pick<RecommendationRevisionVersionV1, "recommendation_summary" | "recommended_action" | "urgency" | "approval_level" | "confidence" | "unknowns" | "conflicts">;
  changed_assumption_ids: string[];
  added_evidence_ids: string[];
  preserved_evidence_ids: string[];
  confidence_delta: {
    before: ExplanationConfidence;
    after: ExplanationConfidence;
    direction: "UP" | "DOWN" | "UNCHANGED";
    reason: string;
  };
  action_delta: "CHANGED" | "UNCHANGED";
  urgency_delta: "CHANGED" | "UNCHANGED";
  approval_class_delta: "CHANGED" | "UNCHANGED";
  why_changed: string[];
};

export type RecommendationRevisionResultV1 = {
  contract_version: "recommendation_revision_v1";
  input_id: string;
  classification: RevisionInputClassificationV1;
  facts_mutated: boolean;
  memory_mutated: boolean;
  old_recommendation: RecommendationRevisionVersionV1;
  active_recommendation: RecommendationRevisionVersionV1;
  preserved_versions: RecommendationRevisionVersionV1[];
  diff: RecommendationDecisionDiffV1 | null;
  provenance: RevisionProvenanceV1;
  hypothetical_not_promoted_to_fact: boolean;
  unknowns_explicit: boolean;
  conflicted_evidence_explicit: boolean;
  keegan_action_required: "NO";
};
