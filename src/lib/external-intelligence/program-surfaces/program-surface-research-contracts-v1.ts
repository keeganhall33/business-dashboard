import type { ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type {
  ExternalSourceClassV1,
  FetchedPagePreviewV1,
  ResearchSourceCandidateV1,
  RetentionModeV1
} from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";
import type { ProgramSurfacePredicateV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-policy-v1";

export type ProgramSurfaceQuestionTypeV1 =
  | "RQ_EVENT_FOOTPRINT"
  | "RQ_PARTNERSHIP_ACTIVATION"
  | "RQ_VIP_HOSPITALITY"
  | "RQ_RELATIONSHIP_RECOGNITION"
  | "RQ_PHYSICAL_ENVIRONMENT"
  | "RQ_PHILANTHROPY_FUNDRAISING"
  | "RQ_MERCHANDISING"
  | "RQ_LICENSING"
  | "RQ_RETAIL_DISTRIBUTION"
  | "RQ_ART_CULTURE_DESIGN_PROGRAMS"
  | "RQ_COMMEMORATION_PROGRAM";

export type ProgramSurfaceResearchQuestionV1 = {
  research_question_id: string;
  candidate_id: string;
  question_type: ProgramSurfaceQuestionTypeV1;

  subject: EntityRef;

  // Execution must be policy-driven, not free-form.
  question_policy_version: string;
  // Human-readable wording is allowed but non-authoritative.
  question_text: string;

  source_domain: "EXTERNAL";

  bounds: {
    // V1 per-question acquisition budget.
    max_queries: number; // <=2
    max_results_per_query: number; // <=5
    max_unique_urls: number; // <=8
    max_selected_sources: number; // <=1
    fetch_timeout_ms: number;
    fetch_max_bytes: number;
  };
};

export type ProgramSurfaceResearchAnswerStatusV1 =
  | "ANSWERED"
  | "PARTIAL"
  | "NOT_FOUND_WITHIN_BOUNDED_RESEARCH"
  | "EXPLICITLY_NOT_PRESENT"
  | "NOT_APPLICABLE"
  | "DISCOVERY_UNAVAILABLE"
  | "NO_DISCOVERY_RESULTS"
  | "NO_ELIGIBLE_SOURCES"
  | "BLOCKED_BY_SOURCE_POLICY"
  | "BLOCKED_BY_RETENTION_POLICY"
  | "FETCH_FAILED";

export type ProgramSurfaceNormalizedCandidateV1 = {
  predicate: ProgramSurfacePredicateV1;
  object_value: string;
  qualifiers: ClaimQualifierV2[];
  normalization_confidence: "high" | "medium" | "low";

  // Factual support classification, not business interpretation.
  support_verdict: "clearly_supported" | "partially_supported" | "not_supported";
  support_rationale: string;

  // Evidence references: excerpts are bounded; raw HTML is never returned.
  support_excerpts: Array<{ text_hash: string; char_count: number }>; // references only
};

export type ProgramSurfaceClaimPreviewV1 = {
  predicate: ProgramSurfacePredicateV1;
  object_value: string;
  qualifiers: ClaimQualifierV2[];
  confidence: "high" | "medium";

  // Prospective no-write ids/hashes.
  prospective_evidence_reference_id: string;
  prospective_evidence_content_hash: string;
  prospective_claim_id: string;
  prospective_claim_fingerprint: string;
  prospective_claim_content_hash: string;

  semantic_fact_already_present_elsewhere: boolean;
};

export type ProgramSurfaceResearchPreviewV1 = {
  research_question_id: string;
  candidate_id: string;
  question_type: ProgramSurfaceQuestionTypeV1;
  subject_entity_id: string;
  subject_canonical_name: string;

  discovery_queries: Array<{ query_id: string; query: string }>;
  urls_considered: number;
  selected_sources: Array<{ canonical_url: string; source_class: ExternalSourceClassV1 }>;
  fetched: FetchedPagePreviewV1[];

  prospective_source_id: string;
  prospective_evidence_reference_id: string;
  evidence_reuse: "YES" | "NO";

  source_eligibility: "PASS" | "FAIL";
  retention_policy: "structured_metadata" | "quote_only" | "link_only" | "blocked";
  raw_html_transient: "YES" | "NO";
  raw_html_retained: "NO";

  retained_support: "structured_metadata" | "bounded_excerpts" | "neither";

  normalized_candidates: ProgramSurfaceNormalizedCandidateV1[];
  claim_previews: ProgramSurfaceClaimPreviewV1[];

  answer_status: ProgramSurfaceResearchAnswerStatusV1;
  answer_reason: string | null;
};

export type ProgramSurfaceResearchExecutorResultV1 =
  | { status: "unsupported"; reason: string }
  | { status: "blocked"; reason: string }
  | { status: "preview"; preview: ProgramSurfaceResearchPreviewV1 };

export type ProgramSurfaceResearchDepsV1 = {
  discovery: { search: (input: { query: string; max_results: number }) => Promise<Array<{ url: string; title: string | null; snippet: string | null; rank: number }>> };
  evidenceReuseLookup: (input: { source_id: string; canonical_url: string }) => Promise<{ exists: boolean }>;
  claimLookupByPredicate: (input: { predicate: ProgramSurfacePredicateV1 }) => Promise<{ claim_count: number }>;
  fetchPage: (input: { canonical_url: string; timeout_ms: number; max_bytes: number }) => Promise<
    | { ok: true; preview: FetchedPagePreviewV1; transient: { raw_html: string } | null; retention_mode: RetentionModeV1 }
    | { ok: false; http_status: number; error: string; final_url: string }
  >;
  classifySource: (input: { canonical_url: string; title: string | null; snippet: string | null }) => ResearchSourceCandidateV1;
  canonicalizeUrl: (input: string) => { canonical_url: string; domain: string };
  computeSourceId: (input: { domain: string }) => string;
  computeEvidenceReferenceId: (input: { source_id: string; canonical_url: string }) => string;
};
