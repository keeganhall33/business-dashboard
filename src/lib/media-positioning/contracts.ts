export const MEDIA_POSITIONING_CONTRACT_VERSION_V1 = "media_positioning_v1.0";

export type ProofPointCategoryV1 =
  | "ELITE_ATHLETE"
  | "MUSIC_CULTURE"
  | "INSTITUTIONAL"
  | "MAJOR_MEDIA"
  | "CHARITY_IMPACT"
  | "CRAFT_MASTERY"
  | "PLACE_MOMENT";

export type EndorsementStatusV1 =
  | "CONFIRMED_ENDORSEMENT"
  | "OWNERSHIP_OR_RECEIPT_ONLY"
  | "DEPICTION_ONLY"
  | "MEDIA_COVERAGE_ONLY"
  | "INSTITUTIONAL_ASSOCIATION"
  | "UNKNOWN";

export type RightsStatusV1 = "CLEARED" | "REVIEW_REQUIRED" | "RESTRICTED" | "UNKNOWN";
export type AssetQualityV1 = "HERO" | "STRONG" | "USABLE" | "LOW" | "UNKNOWN";
export type AssetKindV1 = "VIDEO" | "PHOTO" | "ARTWORK_SCAN" | "INTERVIEW" | "PRESS_CLIP" | "PROCESS_CAPTURE" | "DOCUMENT";
export type ProductionBurdenV1 = "LOW" | "MEDIUM" | "HIGH" | "HUMAN_EDITOR_REQUIRED" | "HUMAN_SHOOTER_REQUIRED";

export type RecommendationClassV1 =
  | "ARCHIVE_REPURPOSE"
  | "NEW_VOICEOVER"
  | "NEW_ON_CAMERA"
  | "NEW_PREMIUM_CAPTURE"
  | "EVENT_CAPTURE"
  | "DO_NOT_PUBLISH_YET";

export type DistributionFormatV1 =
  | "REEL"
  | "CAROUSEL"
  | "LONG_CAPTION_POST"
  | "YOUTUBE_SHORT"
  | "PRESS_KIT_NOTE"
  | "RELATIONSHIP_FOLLOW_UP_ASSET";

export type MediaProvenanceV1 = {
  source_id: string;
  source_label: string;
  evidence_type: "FIRST_PARTY_ARCHIVE" | "PUBLIC_MEDIA" | "CRM_RELATIONSHIP_PROOF" | "FIXTURE_BASELINE" | "UNKNOWN";
  observed_at: string;
  notes: string;
};

export type MediaProofPointV1 = {
  contract_version: typeof MEDIA_POSITIONING_CONTRACT_VERSION_V1;
  proof_point_id: string;
  label: string;
  category: ProofPointCategoryV1;
  people_or_entities: string[];
  project_or_moment: string;
  narrative_use: string;
  prestige_signal: "HIGH" | "MEDIUM" | "LOW";
  endorsement_status: EndorsementStatusV1;
  endorsement_safeguard: string;
  provenance: MediaProvenanceV1[];
  relationship_strategy_refs: string[];
};

export type MediaAssetRecordV1 = {
  contract_version: typeof MEDIA_POSITIONING_CONTRACT_VERSION_V1;
  asset_id: string;
  proof_point_refs: string[];
  kind: AssetKindV1;
  title: string;
  people_or_entities: string[];
  project_or_moment: string;
  location: string | null;
  captured_at: string | null;
  quality: AssetQualityV1;
  rights_status: RightsStatusV1;
  rights_notes: string;
  narrative_tags: string[];
  reusable_excerpt_notes: string[];
  archive_status: "INDEXED_FIXTURE" | "NEEDS_INDEXING" | "MISSING";
  provenance: MediaProvenanceV1[];
};

export type MediaPositioningOpportunityV1 = {
  contract_version: typeof MEDIA_POSITIONING_CONTRACT_VERSION_V1;
  opportunity_id: string;
  why_now: string;
  narrative: string;
  proof_point_refs: string[];
  positioning_objective: string;
  cultural_window: string | null;
  relationship_strategy_refs: string[];
  expected_positioning_value: "HIGH" | "MEDIUM" | "LOW";
  risk_notes: string[];
};

export type ContentBriefV1 = {
  contract_version: typeof MEDIA_POSITIONING_CONTRACT_VERSION_V1;
  brief_id: string;
  opportunity_ref: string;
  recommendation: RecommendationClassV1;
  hook: string;
  thesis: string;
  proof_asset_refs: string[];
  missing_capture: string[];
  story_arc: string[];
  shot_list: string[];
  edit_instructions: string[];
  caption_or_cta_intent: string;
  distribution_format: DistributionFormatV1;
  positioning_objective: string;
  rights_status: RightsStatusV1;
  production_burden: ProductionBurdenV1;
  approval_required: true;
  do_not_publish_reason: string | null;
  ai_value_add: string[];
  human_requirements: string[];
  endorsement_guardrails: string[];
};

export type MediaNarrativeQueueItemV1 = {
  queue_id: string;
  opportunity_ref: string;
  brief_ref: string;
  cadence_reason: string;
  related_cultural_window: string | null;
  relationship_strategy_refs: string[];
  arbitrary_calendar_slot: false;
};

export type MediaPositioningFixtureBundleV1 = {
  contract_version: typeof MEDIA_POSITIONING_CONTRACT_VERSION_V1;
  generated_at: string;
  proof_points: MediaProofPointV1[];
  assets: MediaAssetRecordV1[];
  opportunities: MediaPositioningOpportunityV1[];
  briefs: ContentBriefV1[];
  narrative_queue: MediaNarrativeQueueItemV1[];
  archive_ingestion_design: {
    indexed_fields: string[];
    future_connectors: string[];
    rights_and_endorsement_policy: string[];
    ai_value_add: string[];
    human_production_boundaries: string[];
  };
};

export type MediaPositioningDashboardCardV1 = {
  card_version: "media_positioning_dashboard_card_v1.0";
  opportunity_id: string;
  why_now: string;
  narrative: string;
  proof: string[];
  assets_available: string[];
  assets_missing: string[];
  rights_status: RightsStatusV1;
  recommended_format: DistributionFormatV1;
  recommendation: RecommendationClassV1;
  production_burden: ProductionBurdenV1;
  positioning_value: "HIGH" | "MEDIUM" | "LOW";
  next_action: string;
  approval: "REQUIRED_BEFORE_PUBLIC_POSTING";
};
