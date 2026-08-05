import { z } from "zod";

import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const ManualIntakeRecordSchema = z
  .object({
    schema_version: z.literal("manual_collection_intake_v1"),

    source_id: z.string().min(3).max(128),
    source_config_version: z.string().min(1).max(64),
    registry_hash: z.string().min(64).max(64),

    reviewer: z.string().min(1).max(64),
    reviewed_at: z.string().datetime(),

    source_reference: z
      .object({
        url: z.string().url().nullable(),
        external_id: z.string().min(1).max(128).nullable()
      })
      .strict(),

    artifact_type: z.string().min(1).max(64),

    permitted_excerpt_or_metadata: z.string().min(1).max(2000),

    legal_retention_classification: z.enum(["metadata_only", "link_only", "excerpt_limited", "no_copy"]),

    content_hash: z.string().min(64).max(64),

    review_notes: z.string().min(1).max(2000),
    approval_state: z.enum(["draft", "approved", "rejected"])
  })
  .strict();

export type ManualIntakeRecord = z.infer<typeof ManualIntakeRecordSchema>;

export function computeManualIntakeId(record: Omit<ManualIntakeRecord, "schema_version">): string {
  return sha256CanonicalJson({ v: "manual-intake/v1", ...record });
}
