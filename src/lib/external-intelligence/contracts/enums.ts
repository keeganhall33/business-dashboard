// Phase A1: Canonical external-intelligence enums.
//
// Naming boundary reminder:
// - This module defines enums for external-intelligence objects.
// - Do not introduce unqualified generic Finding/Hypothesis contracts under external-intelligence.
// - Use explicit names: ExternalSignal, ExternalFinding, ExternalHypothesis.

export type ObjectType =
  | "evidence_reference"
  | "claim"
  | "signal"
  | "policy"
  // Reserved (not implemented in A1 contracts)
  | "finding"
  | "hypothesis"
  | "world_model_state"
  | "opportunity"
  | "risk"
  | "fusion_context"
  | "contradiction";

export const OBJECT_TYPE_VALUES: ObjectType[] = [
  "evidence_reference",
  "claim",
  "signal",
  "policy",
  "finding",
  "hypothesis",
  "world_model_state",
  "opportunity",
  "risk",
  "fusion_context",
  "contradiction"
];

export type ApprovalStatus = "draft" | "approved" | "retired";

export type AccessClassification =
  | "public"
  | "paywalled"
  | "licensed"
  | "terms_restricted"
  | "manual_only"
  | "unsuitable_for_automation";

export type RetentionPolicy = "link_only" | "quote_only" | "summary_only" | "licensed_fulltext";

export type EvidenceType =
  | "official_announcement"
  | "report"
  | "dataset"
  | "transcript"
  | "filing"
  | "price_result"
  | "schedule"
  | "social_post"
  | "other";

export type CorrectionStatus = "none" | "corrected";
export type RetractionStatus = "none" | "retracted";

export type EntityResolutionStatus =
  | "resolved"
  | "provisionally_resolved"
  | "ambiguous"
  | "unresolved"
  | "merged"
  | "split"
  | "superseded";

export type ObservedVsInferred = "observed" | "inferred";

export type ClaimVerificationState =
  | "unverified"
  | "developing"
  | "corroborated"
  | "contradicted"
  | "corrected"
  | "retracted";

export type SignalLifecycleStatus =
  | "candidate"
  | "active"
  | "corroborated"
  | "contradicted"
  | "under_review"
  | "updated"
  | "superseded"
  | "expired"
  | "invalidated"
  | "archived";

export type SignalDisposition =
  | "suppress"
  | "archive_only"
  | "monitor"
  | "validate"
  | "escalate_to_external_finding"
  | "escalate_to_opportunity"
  | "send_to_fusion_context";

export type ConfidenceLevel = "known" | "likely" | "possible" | "rumor" | "speculation" | "unknown";
