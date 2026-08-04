import type {
  AccessClassification,
  CorrectionStatus,
  EvidenceType,
  RetentionPolicy,
  RetractionStatus
} from "@/lib/external-intelligence/contracts/enums";

export type EvidenceReference = {
  // Canonical id field name (never evidence_id)
  evidence_reference_id: string;

  // Source governance pinning
  source_id: string;
  source_config_version: string;
  source_set_id: string | null;

  // Artifact addressing
  source_artifact_identifier: string | null;
  source_url_or_reference: string;

  // Immutable content identity (when retention permits)
  content_hash: string | null;

  // Timestamps
  retrieved_at: string; // ISO-8601
  published_at: string | null; // ISO-8601
  event_time: string | null; // ISO-8601

  evidence_type: EvidenceType;

  // Legal/access + retention (must fail-closed when unknown)
  access_classification: AccessClassification;
  legal_policy_version: string;
  retention_policy: RetentionPolicy;

  // Pointer to stored excerpt/summary (not full text)
  excerpt_or_summary_reference: string | null;

  // Registry prior (may be summarized downstream)
  source_credibility_prior: "high" | "medium" | "low";

  // Correction/retraction (append-only via supersession)
  correction_status: CorrectionStatus;
  retraction_status: RetractionStatus;
  supersedes_evidence_reference_id: string | null;

  // Arbitrary structured provenance metadata (capture method, reviewer, tool, etc.)
  provenance_metadata: Record<string, unknown>;

  schema_version: string;
};
