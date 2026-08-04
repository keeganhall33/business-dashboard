import type { ConfidenceAxes } from "@/lib/external-intelligence/contracts/confidence-axes";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type {
  AccessClassification,
  SignalDisposition,
  SignalLifecycleStatus
} from "@/lib/external-intelligence/contracts/enums";

export type ExternalSignalType =
  | "verified_event"
  | "market_observation"
  | "trend_signal"
  | "policy_change"
  | "rumor"
  | "correction"
  | "retraction";

export type ExternalSignalClassification =
  | "official"
  | "independently_reported"
  | "single_source"
  | "developing"
  | "rumor"
  | "corrected"
  | "retracted";

export type ExternalSignalCredibility = {
  level: "high" | "medium" | "low";
  reasons: string[];
};

export type ExternalSignal = {
  // Identity and versioning
  signal_id: string;
  signal_schema_version: string;

  // Policy versions (pinned)
  interpretation_policy_version: string;
  confidence_policy_version: string;
  disposition_policy_version: string;
  legal_policy_version: string;
  entity_resolution_version: string;
  source_registry_version: string;

  signal_fingerprint: string;

  created_at: string;
  updated_at: string;
  first_observed_at: string;
  last_observed_at: string;

  lifecycle_status: SignalLifecycleStatus;
  supersedes_signal_ids: string[];
  superseded_by_signal_id: string | null;

  // Classification
  signal_type: ExternalSignalType;
  signal_classification: ExternalSignalClassification;

  business_domains: string[];
  affected_entities: EntityRef[];
  affected_markets: string[];
  geography: string | null;
  languages: string[];

  source_ids: string[];
  source_set_ids: string[];

  // Version pinning (required)
  evidence_reference_version_refs: VersionRef[]; // evidence_reference
  claim_version_refs: VersionRef[]; // claim (or claim_id refs until persisted)

  event_version_refs: VersionRef[];
  relationship_version_refs: VersionRef[];
  trend_version_refs: VersionRef[];

  // Interpretation
  normalized_statement: string;
  observed_fact: string;
  inferred_interpretation: string | null;

  expected_business_mechanism: string | null;
  internal_business_relevance: string | null;
  strategic_fit: string | null;
  opportunity_relevance: string | null;
  risk_relevance: string | null;

  novelty: "unknown" | "new" | "known";
  urgency: "low" | "medium" | "high" | "unknown";
  expiration: string; // ISO-8601 (derived)
  review_by: string | null;

  // Evidence and uncertainty
  supporting_evidence: Array<{ evidence_reference: VersionRef; claim_refs: VersionRef[] }>;
  contradicting_evidence: Array<{ evidence_reference: VersionRef; claim_refs: VersionRef[] }>;
  missing_evidence: string[];

  corroboration_count: number;
  independent_source_count: number;

  source_credibility_summary: string;
  signal_credibility: ExternalSignalCredibility;
  confidence: ConfidenceAxes;
  uncertainty_reasons: string[];

  what_would_strengthen: string[];
  what_would_weaken: string[];
  what_would_invalidate: string[];

  // Lifecycle and disposition
  disposition: SignalDisposition;
  disposition_reason_codes: string[];

  escalation_eligibility: "eligible" | "blocked" | "requires_review";
  fusion_eligibility: "eligible" | "blocked" | "requires_review";

  monitoring_cadence: string | null;
  relevance_expires_at: string;
  archived_at: string | null;

  // Audit
  extraction_method: "deterministic" | "ai_assisted" | "human";
  deterministic_rules_applied: string[];
  llm_assistance_used: boolean;
  model_version: string | null;
  prompt_version: string | null;
  human_review_status: "unreviewed" | "reviewed" | "rejected" | null;
  correction_history: Array<Record<string, unknown>>;

  // Legal/access summary (signal-level)
  access_classification: AccessClassification;
};

// NOTE: Fingerprinting helpers are intentionally deferred to a later slice once
// entity resolution and claim persistence/versioning details are finalized.
