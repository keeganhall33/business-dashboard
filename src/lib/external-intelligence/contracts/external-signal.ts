import type { ConfidenceAxes } from "@/lib/external-intelligence/contracts/confidence-axes";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type {
  AccessClassification,
  SignalDisposition,
  SignalLifecycleStatus
} from "@/lib/external-intelligence/contracts/enums";
import { z } from "zod";

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

export const ExternalSignalSchema = z
  .object({
    signal_id: z.string().min(1),
    signal_schema_version: z.string().min(1),
    interpretation_policy_version: z.string().min(1),
    confidence_policy_version: z.string().min(1),
    disposition_policy_version: z.string().min(1),
    legal_policy_version: z.string().min(1),
    entity_resolution_version: z.string().min(1),
    source_registry_version: z.string().min(1),
    signal_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    first_observed_at: z.string().datetime({ offset: true }),
    last_observed_at: z.string().datetime({ offset: true }),
    lifecycle_status: z.enum([
      "candidate",
      "active",
      "corroborated",
      "contradicted",
      "under_review",
      "updated",
      "superseded",
      "expired",
      "invalidated",
      "archived"
    ]) as z.ZodType<SignalLifecycleStatus>,
    supersedes_signal_ids: z.array(z.string()),
    superseded_by_signal_id: z.string().min(1).nullable(),
    signal_type: z.enum([
      "verified_event",
      "market_observation",
      "trend_signal",
      "policy_change",
      "rumor",
      "correction",
      "retraction"
    ]) as z.ZodType<ExternalSignalType>,
    signal_classification: z.enum([
      "official",
      "independently_reported",
      "single_source",
      "developing",
      "rumor",
      "corrected",
      "retracted"
    ]) as z.ZodType<ExternalSignalClassification>,
    business_domains: z.array(z.string()),
    affected_entities: z.array(z.any()),
    affected_markets: z.array(z.string()),
    geography: z.string().min(1).nullable(),
    languages: z.array(z.string()),
    source_ids: z.array(z.string()),
    source_set_ids: z.array(z.string()),
    evidence_reference_version_refs: z.array(z.any()),
    claim_version_refs: z.array(z.any()),
    event_version_refs: z.array(z.any()),
    relationship_version_refs: z.array(z.any()),
    trend_version_refs: z.array(z.any()),
    normalized_statement: z.string().min(1),
    observed_fact: z.string().min(1),
    inferred_interpretation: z.string().min(1).nullable(),
    expected_business_mechanism: z.string().min(1).nullable(),
    internal_business_relevance: z.string().min(1).nullable(),
    strategic_fit: z.string().min(1).nullable(),
    opportunity_relevance: z.string().min(1).nullable(),
    risk_relevance: z.string().min(1).nullable(),
    novelty: z.enum(["unknown", "new", "known"]),
    urgency: z.enum(["low", "medium", "high", "unknown"]),
    expiration: z.string().datetime({ offset: true }),
    review_by: z.string().datetime({ offset: true }).nullable(),
    supporting_evidence: z.array(z.any()),
    contradicting_evidence: z.array(z.any()),
    missing_evidence: z.array(z.string()),
    corroboration_count: z.number().int().min(0),
    independent_source_count: z.number().int().min(0),
    source_credibility_summary: z.string(),
    signal_credibility: z
      .object({ level: z.enum(["high", "medium", "low"]), reasons: z.array(z.string()) })
      .strict(),
    confidence: z.any(),
    uncertainty_reasons: z.array(z.string()),
    what_would_strengthen: z.array(z.string()),
    what_would_weaken: z.array(z.string()),
    what_would_invalidate: z.array(z.string()),
    disposition: z.enum([
      "suppress",
      "archive_only",
      "monitor",
      "validate",
      "escalate_to_external_finding",
      "escalate_to_opportunity",
      "send_to_fusion_context"
    ]) as z.ZodType<SignalDisposition>,
    disposition_reason_codes: z.array(z.string()),
    escalation_eligibility: z.enum(["eligible", "blocked", "requires_review"]),
    fusion_eligibility: z.enum(["eligible", "blocked", "requires_review"]),
    monitoring_cadence: z.string().min(1).nullable(),
    relevance_expires_at: z.string().datetime({ offset: true }),
    archived_at: z.string().datetime({ offset: true }).nullable(),
    extraction_method: z.enum(["deterministic", "ai_assisted", "human"]),
    deterministic_rules_applied: z.array(z.string()),
    llm_assistance_used: z.boolean(),
    model_version: z.string().min(1).nullable(),
    prompt_version: z.string().min(1).nullable(),
    human_review_status: z.enum(["unreviewed", "reviewed", "rejected"]).nullable(),
    correction_history: z.array(z.record(z.string(), z.unknown())),
    access_classification: z.enum([
      "public",
      "paywalled",
      "licensed",
      "terms_restricted",
      "manual_only",
      "unsuitable_for_automation"
    ]) as z.ZodType<AccessClassification>
  })
  .strict();

// NOTE: Fingerprinting helpers are intentionally deferred to a later slice once
// entity resolution and claim persistence/versioning details are finalized.
