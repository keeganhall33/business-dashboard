export type IntelligenceQualityDimensionV1 =
  | "EVIDENCE_GROUNDING"
  | "UNCERTAINTY_HONESTY"
  | "INTERNAL_CONSISTENCY"
  | "NON_DUPLICATION"
  | "ACTIONABILITY"
  | "PRIORITIZATION"
  | "REVISION_AFTER_NEW_EVIDENCE"
  | "DOWNSIDE_VISIBILITY"
  | "OPPORTUNITY_COST"
  | "STRONGEST_CASE_AGAINST"
  | "EVIDENCE_CALIBRATION"
  | "CROSS_DOMAIN_ALIGNMENT";

export type IntelligenceQualityStateV1 = "PASS" | "FAIL" | "NOT_APPLICABLE";
export type EvidenceClassV1 = "DIRECT" | "PROXY" | "INFERRED" | "UNKNOWN";
export type TruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type BusinessDomainV1 =
  | "STRATEGY"
  | "FINANCIAL"
  | "RELATIONSHIPS"
  | "CAPACITY"
  | "RISK"
  | "RIGHTS"
  | "MARKET"
  | "CREATIVE"
  | "OPERATIONS"
  | "CRM"
  | "EVENTS"
  | "COLLECTORS"
  | "PROJECTS"
  | "ORDERS_REVENUE"
  | "MARKETING_MEDIA"
  | "PARTNERSHIPS"
  | "MEMORY_EMAIL_STYLE"
  | "OUTCOME_LEARNING";

export type SyntheticBusinessEvidenceV1 = {
  id: string;
  domain: BusinessDomainV1;
  evidence_class: EvidenceClassV1;
  truth_state: TruthStateV1;
  source_label: string;
  claim: string;
  supports_recommendation: boolean;
  underlying_signal_id: string;
};

export type IntelligenceRecommendationEvalInputV1 = {
  recommendation_id: string;
  title: string;
  current_action: string | null;
  priority_rank: number | null;
  evidence_refs: string[];
  evidence: SyntheticBusinessEvidenceV1[];
  uncertainty_notes: string[];
  downside: string | null;
  opportunity_cost: string | null;
  strongest_case_against: string | null;
  duplicates_underlying_signal_ids: string[];
  revision?: {
    previous_action: string;
    new_action: string;
    new_evidence_refs: string[];
    preserved_prior_rationale: string[];
    history_versions: number[];
  };
};

export type IntelligenceQualityDimensionResultV1 = {
  dimension: IntelligenceQualityDimensionV1;
  state: IntelligenceQualityStateV1;
  reason: string;
};

export type IntelligenceQualityEvalResultV1 = {
  contract_version: "intelligence_quality_eval_v1";
  recommendation_id: string;
  title: string;
  dimensions: IntelligenceQualityDimensionResultV1[];
  failed_dimensions: IntelligenceQualityDimensionV1[];
  synthetic_domains_covered: BusinessDomainV1[];
  scorecard: {
    pass_count: number;
    fail_count: number;
    not_applicable_count: number;
    artificial_precision: false;
    executive_ui_safe: false;
  };
};
