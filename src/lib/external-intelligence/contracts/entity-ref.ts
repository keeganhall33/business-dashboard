import type { EntityResolutionStatus } from "@/lib/external-intelligence/contracts/enums";
import type { ConfidenceAxis } from "@/lib/external-intelligence/contracts/confidence-axes";
import { z } from "zod";

export type EntityRef = {
  entity_id: string;
  entity_type: string;
  canonical_name: string;

  aliases: string[];
  source_specific_ids: Record<string, string>; // { source_id: source_native_id }

  resolution_status: EntityResolutionStatus;
  resolution_confidence: ConfidenceAxis;

  ambiguity_flags: string[];
  possible_entity_ids: string[];

  alias_provenance: Array<{ alias: string; source_id: string; evidence_reference_id?: string | null }>;
  entity_resolution_version: string;

  last_verified_at: string | null; // ISO-8601
  valid_from: string | null; // ISO-8601
  valid_until: string | null; // ISO-8601
};

export const EntityRefSchema = z
  .object({
    entity_id: z.string().min(1),
    entity_type: z.string().min(1),
    canonical_name: z.string().min(1),
    aliases: z.array(z.string()),
    source_specific_ids: z.record(z.string(), z.string()),
    resolution_status: z.enum([
      "resolved",
      "provisionally_resolved",
      "ambiguous",
      "unresolved",
      "merged",
      "split",
      "superseded"
    ]) as z.ZodType<EntityResolutionStatus>,
    resolution_confidence: z.any(),
    ambiguity_flags: z.array(z.string()),
    possible_entity_ids: z.array(z.string()),
    alias_provenance: z.array(
      z
        .object({
          alias: z.string().min(1),
          source_id: z.string().min(1),
          evidence_reference_id: z.string().min(1).nullable().optional()
        })
        .strict()
    ),
    entity_resolution_version: z.string().min(1),
    last_verified_at: z.string().datetime({ offset: true }).nullable(),
    valid_from: z.string().datetime({ offset: true }).nullable(),
    valid_until: z.string().datetime({ offset: true }).nullable()
  })
  .strict();

export function isAmbiguousEntity(ref: EntityRef): boolean {
  return ref.resolution_status === "ambiguous" || ref.resolution_status === "unresolved";
}
