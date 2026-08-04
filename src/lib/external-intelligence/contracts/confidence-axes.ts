import type { ConfidenceLevel } from "@/lib/external-intelligence/contracts/enums";
import { VersionRefSchema, type VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { z } from "zod";

export type ConfidenceAxis = {
  level: ConfidenceLevel;

  /**
   * Optional bounded score, only when defensible.
   * Must not be used to fabricate probabilities.
   */
  bounded_score: number | null; // 0..1 or null

  reasons: string[];
  blockers: string[];

  supporting_reference_ids: VersionRef[];
  contradicting_reference_ids: VersionRef[];
  missing_evidence_ids: string[];
};

export const ConfidenceAxisSchema = z
  .object({
    level: z.enum(["known", "likely", "possible", "rumor", "speculation", "unknown"]) as z.ZodType<ConfidenceLevel>,
    bounded_score: z.number().min(0).max(1).nullable(),
    reasons: z.array(z.string()),
    blockers: z.array(z.string()),
    supporting_reference_ids: z.array(VersionRefSchema),
    contradicting_reference_ids: z.array(VersionRefSchema),

    // Minimal strict reference type for A1: ids only (MissingEvidenceItem is not implemented yet).
    missing_evidence_ids: z.array(z.string().min(1))
  })
  .strict();

export type ConfidenceAxes = {
  evidence: ConfidenceAxis;
  interpretation: ConfidenceAxis;
  business_relevance: ConfidenceAxis;
  mechanism: ConfidenceAxis;
  timing: ConfidenceAxis;
  entity_resolution: ConfidenceAxis;
  overall: ConfidenceAxis; // derived
};

export const ConfidenceAxesSchema = z
  .object({
    evidence: ConfidenceAxisSchema,
    interpretation: ConfidenceAxisSchema,
    business_relevance: ConfidenceAxisSchema,
    mechanism: ConfidenceAxisSchema,
    timing: ConfidenceAxisSchema,
    entity_resolution: ConfidenceAxisSchema,
    overall: ConfidenceAxisSchema
  })
  .strict();
