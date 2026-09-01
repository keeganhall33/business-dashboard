import type { DecisionEvidenceRefV1 } from "@/lib/decision-evidence/contracts";

export type SourceAuthorityLevelV1 = "PRIMARY" | "OFFICIAL" | "CREDIBLE_SECONDARY" | "INTERNAL_ANALYSIS" | "UNSUPPORTED";
export type SourceAuthorityConflictStatusV1 = "CONFLICTED" | "BEST_EVIDENCE_AVAILABLE" | "UNKNOWN";

export type SourceAuthorityClaimV1 = DecisionEvidenceRefV1 & {
  claim_id: string;
  claim: string;
  source_authority: SourceAuthorityLevelV1;
  corroborates_ref_ids: string[];
};

export type SourceAuthorityConflictInputV1 = {
  contract_version: "source_authority_conflict_input_v1";
  case_id: string;
  claim_subject: string;
  claims: SourceAuthorityClaimV1[];
};

export type SourceAuthorityConflictEvidenceV1 = {
  ref_id: string;
  label: string;
  claim: string;
  source_authority: SourceAuthorityLevelV1;
  authority_score: number;
  freshness_state: DecisionEvidenceRefV1["freshness_state"];
  freshness_score: number;
  directness: DecisionEvidenceRefV1["directness"];
  directness_score: number;
  truth_state: DecisionEvidenceRefV1["truth_state"];
  corroboration_count: number;
  review_priority: number;
  notes: string;
};

export type SourceAuthorityConflictV1 = {
  contract_version: "source_authority_conflict_v1";
  case_id: string;
  claim_subject: string;
  status: SourceAuthorityConflictStatusV1;
  WHAT_CONFLICTS: string[];
  CURRENT_BEST_EVIDENCE: SourceAuthorityConflictEvidenceV1[];
  WHAT_TO_VERIFY_NEXT: string[];
  unsupported_claim_ref_ids: string[];
  stale_authority_did_not_override_fresher_primary: boolean;
  unknown_remains_unknown: boolean;
};
