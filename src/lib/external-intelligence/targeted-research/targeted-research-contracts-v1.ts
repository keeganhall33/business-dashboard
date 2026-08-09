export type ExternalQuestionTypeV1 = "ORGANIZATION_CONTEXT";

export type ExternalSourceClassV1 =
  | "OFFICIAL_WEBSITE"
  | "OFFICIAL_NEWSROOM"
  | "OFFICIAL_EVENT_PAGE"
  | "OFFICIAL_PARTNER_PAGE"
  | "AUTHORITATIVE_TRADE"
  | "HIGH_QUALITY_NEWS"
  | "OTHER_PUBLIC"
  | "UNKNOWN";

export type OfficialDomainConfidenceV1 = "high" | "medium" | "low" | "unknown";

export type DiscoveryQueryV1 = {
  query_id: string;
  template_id: string;
  query: string;
};

export type DiscoveryResultV1 = {
  url: string;
  title: string | null;
  snippet: string | null;
  rank: number;
};

export type ResearchSourceCandidateV1 = {
  url: string;
  canonical_url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  discovered_via_query_id: string;
  search_rank: number;

  source_class: ExternalSourceClassV1;
  official_domain_confidence: OfficialDomainConfidenceV1;

  selection_status: "considered" | "selected" | "rejected";
  rejection_reason: string | null;
};

export type RetentionModeV1 = "link_only" | "structured_metadata";

export type FetchedPagePreviewV1 = {
  canonical_url: string;
  http_status: number;
  final_url: string;
  content_type: string | null;
  retention_mode: RetentionModeV1;

  // Minimal, safe-to-store metadata.
  title: string | null;
  meta_description: string | null;
  og_site_name: string | null;
  og_title: string | null;
  jsonld_types: string[];
};

export type CandidateContextualClaimPreviewV1 = {
  predicate: "classified_as";
  subject_entity_id: string;
  subject_canonical_name: string;

  classification_kind: "organization_type" | "business_domain";
  classification_value: string;

  source_label: string | null;
  normalization_policy_version: string;
  normalization_confidence: "low" | "medium" | "high";

  claim_id: string;
  claim_fingerprint: string;
  content_hash: string;

  clearly_supported: boolean;
  support_rationale: string;
};

export type TargetedExternalResearchPreviewV1 = {
  research_question_id: string;
  candidate_id: string;
  question_type: ExternalQuestionTypeV1;
  subject_entity_id: string;
  subject_canonical_name: string;

  discovery_queries: DiscoveryQueryV1[];
  urls_considered: number;
  selected_sources: Array<{ canonical_url: string; source_class: ExternalSourceClassV1; official_domain_confidence: OfficialDomainConfidenceV1 }>;

  fetched: FetchedPagePreviewV1[];

  evidence_reuse: "YES" | "NO";
  prospective_source_id: string;
  prospective_evidence_reference_id: string;

  proposed_contextual_claims: CandidateContextualClaimPreviewV1[];
};

export type TargetedExternalResearchExecutorResultV1 =
  | { status: "unsupported"; reason: string }
  | { status: "blocked"; reason: string }
  | { status: "preview"; preview: TargetedExternalResearchPreviewV1 };
