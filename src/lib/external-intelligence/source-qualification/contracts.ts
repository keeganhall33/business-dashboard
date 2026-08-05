import { z } from "zod";

import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

const SourceIdSchema = z.string().min(3).max(128);
const VersionSchema = z.string().min(1).max(64);

export const QualificationStatusSchema = z.enum([
  "approved_for_automated_adapter",
  "approved_for_manual_collection",
  "approved_for_metadata_only",
  "blocked_pending_terms_review",
  "blocked_pending_credentials",
  "blocked_pending_license",
  "blocked_access_method",
  "blocked_implementation",
  "prohibited"
]);

export type QualificationStatus = z.infer<typeof QualificationStatusSchema>;

export const QualificationEvidenceRefSchema = z
  .object({
    label: z.string().min(1).max(120),
    url: z.string().url(),
    note: z.string().min(1).max(300).optional()
  })
  .strict();

export const Wave1QualificationRecordSchema = z
  .object({
    schema_version: z.literal("wave1_source_qualification_v1"),

    source_id: SourceIdSchema,
    source_config_version: VersionSchema,
    registry_schema_version: z.literal("production_source_registry_v1"),
    registry_hash: z.string().min(64).max(64),
    source_sets_hash: z.string().min(64).max(64),

    reviewed_access_method: z.string().min(1).max(64),
    official_documentation_refs: z.array(QualificationEvidenceRefSchema).min(1),

    terms_access_review_status: z.enum(["not_reviewed", "approved", "restricted", "prohibited"]),
    automation_suitability: z.enum(["allowed", "manual_only", "metadata_only", "prohibited"]),

    authentication_required: z.boolean(),
    credential_requirements: z.array(z.string().min(1).max(160)).default([]),

    paywall_or_licensing_required: z.boolean(),
    paywall_or_licensing_notes: z.array(z.string().min(1).max(200)).default([]),

    copyright_and_retention_restrictions: z.array(z.string().min(1).max(200)).default([]),
    rate_limit_notes: z.array(z.string().min(1).max(200)).default([]),

    expected_cadence: z.string().min(1).max(32),
    freshness_expectations: z.string().min(1).max(64),
    implementation_difficulty: z.enum(["low", "medium", "high"]),

    available_fallback_methods: z.array(z.string().min(1).max(64)).default([]),
    approved_artifact_types: z.array(z.string().min(1).max(64)).min(1),
    prohibited_behaviors: z.array(z.string().min(1).max(200)).min(1),

    recommended_collection_mode: z.enum(["automated", "manual", "metadata_only", "disabled"]),

    status: QualificationStatusSchema,
    remaining_blockers: z.array(z.string().min(1).max(200)).default([]),

    reviewer: z.string().min(1).max(64),
    reviewed_at: z.string().datetime(),
    review_by: z.string().min(1).max(64),

    evidence_refs: z.array(QualificationEvidenceRefSchema).min(1),

    qualification_content_hash: z.string().min(64).max(64)
  })
  .strict();

export type Wave1QualificationRecord = z.infer<typeof Wave1QualificationRecordSchema>;

export function parseWave1QualificationRecord(json: unknown): Wave1QualificationRecord {
  const parsed = Wave1QualificationRecordSchema.parse(json);

  // Deterministic ordering.
  parsed.official_documentation_refs = parsed.official_documentation_refs
    .slice()
    .sort((a, b) => a.url.localeCompare(b.url));
  parsed.evidence_refs = parsed.evidence_refs.slice().sort((a, b) => a.url.localeCompare(b.url));
  parsed.credential_requirements = [...new Set(parsed.credential_requirements)].sort((a, b) => a.localeCompare(b));
  parsed.remaining_blockers = [...new Set(parsed.remaining_blockers)].sort((a, b) => a.localeCompare(b));

  return parsed;
}

export function computeQualificationContentHash(record: Omit<Wave1QualificationRecord, "qualification_content_hash">): string {
  // Hash semantic projection only; reviewed_at participates because it is a governance decision.
  return sha256CanonicalJson({ v: "wave1-qualification/v1", ...record });
}
