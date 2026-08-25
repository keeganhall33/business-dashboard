export const SPORTS_ART_PARTNER_UNIVERSE_VERSION_V1 = "sports_art_partner_universe_v1.0" as const;
export const SPORTS_ART_PARTNER_DASHBOARD_VERSION_V1 = "sports_art_partner_dashboard_v1.0" as const;

export type SportsArtTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type SportsArtApprovalStateV1 = "NO_ACTION_REQUIRED" | "KEEGAN_APPROVAL_REQUIRED_BEFORE_EXTERNAL_ACTION";
export type SportsArtCompanyStatusV1 = "ACTIVE_RESEARCH" | "WATCH" | "BENCHMARK_ONLY" | "DEPRIORITIZED" | "UNKNOWN";

export type SportsArtRoleClassificationV1 =
  | "TRUE_STRATEGIC_PARTNER"
  | "PARTNER_TARGET"
  | "LICENSING_TARGET"
  | "DISTRIBUTION_TARGET"
  | "COLLECTIBLES_TARGET"
  | "ATHLETE_ACCESS"
  | "BENCHMARK"
  | "COMPETITOR"
  | "COLLABORATOR"
  | "MARKET_COMPETITIVE_BENCHMARK";

export type SportsArtPartnerFilterV1 =
  | "PARTNER TARGET"
  | "LICENSING TARGET"
  | "DISTRIBUTION TARGET"
  | "COLLECTIBLES TARGET"
  | "ATHLETE ACCESS"
  | "BENCHMARK"
  | "COMPETITOR"
  | "COLLABORATOR";

export type SportsArtEvidenceRefV1 = {
  ref_id: string;
  label: string;
  source: "public_research" | "existing_dashboard_record" | "issue_preserved_context" | "inference";
  url?: string;
  truth_state: SportsArtTruthStateV1;
  notes: string;
};

export type SportsArtPartnerCompanyV1 = {
  company_id: string;
  company_name: string;
  entity_identity: {
    canonical_name: string;
    aliases: string[];
    entity_type: "COMPANY" | "BRAND" | "ARTIST_STUDIO";
    identity_truth_state: SportsArtTruthStateV1;
  };
  role_classifications: SportsArtRoleClassificationV1[];
  filter_tags: SportsArtPartnerFilterV1[];
  strategic_fit_for_keegan: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    summary: string;
    truth_state: SportsArtTruthStateV1;
  };
  relationship_state: {
    level: "STRONG" | "WORKED_WITH" | "COOLED" | "LOWER_LEVEL_STALLED" | "UNKNOWN" | "NONE_EVIDENCED";
    summary: string;
    truth_state: SportsArtTruthStateV1;
  };
  known_contacts_or_access_paths: Array<{
    name: string;
    role_or_path: string;
    state: SportsArtTruthStateV1;
    notes: string;
  }>;
  prior_outreach_or_deal_history: string[];
  prior_economics_or_compensation: {
    summary: string;
    truth_state: SportsArtTruthStateV1;
  };
  licensing_reproduction_rights_relevance: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    summary: string;
    truth_state: SportsArtTruthStateV1;
  };
  athlete_league_team_access_potential: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    summary: string;
    truth_state: SportsArtTruthStateV1;
  };
  distribution_potential: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    summary: string;
    truth_state: SportsArtTruthStateV1;
  };
  collector_audience_overlap: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    summary: string;
    truth_state: SportsArtTruthStateV1;
  };
  collaboration_concepts: string[];
  competitive_benchmark_relevance: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    summary: string;
  };
  risks_or_leverage_concerns: string[];
  current_status: SportsArtCompanyStatusV1;
  timing_or_trigger: string;
  next_safe_action: string;
  approval_state: SportsArtApprovalStateV1;
  what_would_materially_change_ranking: string[];
  preserved_existing_notes: string[];
  evidence_refs: SportsArtEvidenceRefV1[];
};

export type SportsArtPartnerUniverseV1 = {
  contract_version: typeof SPORTS_ART_PARTNER_UNIVERSE_VERSION_V1;
  universe_id: string;
  as_of: string;
  source: "fixture_reconciled_public_research";
  companies: SportsArtPartnerCompanyV1[];
  ranking_principle: {
    not_ranked_by_company_size_only: true;
    factors: string[];
    fanatics_single_point_of_failure_guardrail: true;
  };
  safety: {
    no_external_outreach: true;
    no_duplicate_company_contact_or_opportunity_records_created: true;
    keegan_action_required: "NO";
  };
};

export type SportsArtPartnerDashboardV1 = {
  view_version: typeof SPORTS_ART_PARTNER_DASHBOARD_VERSION_V1;
  universe_id: string;
  filters: SportsArtPartnerFilterV1[];
  rows: Array<{
    company_id: string;
    company_name: string;
    primary_classification: SportsArtRoleClassificationV1;
    filter_tags: SportsArtPartnerFilterV1[];
    relationship_strength: SportsArtPartnerCompanyV1["relationship_state"]["level"];
    existing_access_path: string;
    strategic_upside: SportsArtPartnerCompanyV1["strategic_fit_for_keegan"]["level"];
    licensing_power: SportsArtPartnerCompanyV1["licensing_reproduction_rights_relevance"]["level"];
    distribution_reach: SportsArtPartnerCompanyV1["distribution_potential"]["level"];
    athlete_league_access: SportsArtPartnerCompanyV1["athlete_league_team_access_potential"]["level"];
    economic_attractiveness: SportsArtTruthStateV1;
    competitive_overlap: SportsArtPartnerCompanyV1["competitive_benchmark_relevance"]["level"];
    current_opportunity: string;
    next_action: string;
    keegan_action_required: "NO";
  }>;
};
