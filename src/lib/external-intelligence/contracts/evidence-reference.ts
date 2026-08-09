import type {
  AccessClassification,
  CorrectionStatus,
  EvidenceType,
  RetentionPolicy,
  RetractionStatus
} from "@/lib/external-intelligence/contracts/enums";
import type { SupportExcerptV1 } from "@/lib/external-intelligence/contracts/support-excerpt-v1";
import { SupportExcerptV1Schema } from "@/lib/external-intelligence/contracts/support-excerpt-v1";
import { z } from "zod";

export type EvidenceCredibility = {
  level: "high" | "medium" | "low" | "unknown";
  bounded_score: number | null; // optional, only when defensible
  reasons: string[];
};

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

  /**
   * Optional bounded support excerpts retained solely to audit/reproduce extracted factual Claims.
   * This is NOT full-article retention.
   */
  support_excerpts: SupportExcerptV1[];

  // Registry prior (may be summarized downstream)
  source_credibility_prior: "high" | "medium" | "low";

  // Correction/retraction (append-only via supersession)
  correction_status: CorrectionStatus;
  retraction_status: RetractionStatus;
  supersedes_evidence_reference_id: string | null;

  // Arbitrary structured provenance metadata (capture method, reviewer, tool, etc.)
  provenance_metadata: Record<string, unknown>;

  // Credibility + corroboration/contradiction hooks (architecture-required)
  credibility: EvidenceCredibility;
  corroborating_evidence_reference_ids: string[];
  contradicting_evidence_reference_ids: string[];

  schema_version: string;
};

export const EvidenceReferenceSchema = z
  .object({
    evidence_reference_id: z.string().min(1),
    source_id: z.string().min(1),
    source_config_version: z.string().min(1),
    source_set_id: z.string().min(1).nullable(),
    source_artifact_identifier: z.string().min(1).nullable(),
    source_url_or_reference: z.string().min(1),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    retrieved_at: z.string().datetime({ offset: true }),
    published_at: z.string().datetime({ offset: true }).nullable(),
    event_time: z.string().datetime({ offset: true }).nullable(),
    evidence_type: z.enum([
      "official_announcement",
      "report",
      "dataset",
      "transcript",
      "filing",
      "price_result",
      "schedule",
      "social_post",
      "other"
    ]) as z.ZodType<EvidenceType>,
    access_classification: z.enum([
      "public",
      "paywalled",
      "licensed",
      "terms_restricted",
      "manual_only",
      "unsuitable_for_automation"
    ]) as z.ZodType<AccessClassification>,
    legal_policy_version: z.string().min(1),
    retention_policy: z.enum(["link_only", "quote_only", "summary_only", "licensed_fulltext"]) as z.ZodType<RetentionPolicy>,
    excerpt_or_summary_reference: z.string().min(1).nullable(),

    support_excerpts: z.array(SupportExcerptV1Schema),
    source_credibility_prior: z.enum(["high", "medium", "low"]),
    correction_status: z.enum(["none", "corrected"]) as z.ZodType<CorrectionStatus>,
    retraction_status: z.enum(["none", "retracted"]) as z.ZodType<RetractionStatus>,
    supersedes_evidence_reference_id: z.string().min(1).nullable(),
    provenance_metadata: z.record(z.string(), z.unknown()),

    credibility: z
      .object({
        level: z.enum(["high", "medium", "low", "unknown"]),
        bounded_score: z.number().min(0).max(1).nullable(),
        reasons: z.array(z.string())
      })
      .strict(),
    corroborating_evidence_reference_ids: z.array(z.string().min(1)),
    contradicting_evidence_reference_ids: z.array(z.string().min(1)),

    schema_version: z.string().min(1)
  })
  .strict()
  .superRefine((val, ctx) => {
    const id = val.evidence_reference_id;

    // Reject self-reference.
    if (val.corroborating_evidence_reference_ids.includes(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["corroborating_evidence_reference_ids"],
        message: "EvidenceReference must not corroborate itself"
      });
    }
    if (val.contradicting_evidence_reference_ids.includes(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contradicting_evidence_reference_ids"],
        message: "EvidenceReference must not contradict itself"
      });
    }

    // Reject duplicates (deterministic identity should not depend on duplicates).
    const uniq = (xs: string[]) => new Set(xs).size === xs.length;
    if (!uniq(val.corroborating_evidence_reference_ids)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["corroborating_evidence_reference_ids"],
        message: "corroborating_evidence_reference_ids must not contain duplicates"
      });
    }
    if (!uniq(val.contradicting_evidence_reference_ids)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contradicting_evidence_reference_ids"],
        message: "contradicting_evidence_reference_ids must not contain duplicates"
      });
    }
  });
