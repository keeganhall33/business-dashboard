import type { EntityResolutionStatus } from "@/lib/external-intelligence/contracts/enums";
import { ConfidenceAxisSchema, type ConfidenceAxis } from "@/lib/external-intelligence/contracts/confidence-axes";
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
    resolution_confidence: ConfidenceAxisSchema,
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
  .strict()
  .superRefine((val, ctx) => {
    const isProvisional = val.entity_id.startsWith("provisional:");

    if (val.resolution_status === "resolved" && isProvisional) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["entity_id"], message: "resolved entities must not use provisional ids" });
    }

    if (val.resolution_status === "ambiguous") {
      if (!val.ambiguity_flags.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ambiguity_flags"], message: "ambiguous requires ambiguity_flags" });
      }
      if (!val.possible_entity_ids.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["possible_entity_ids"], message: "ambiguous requires possible_entity_ids" });
      }
    }

    if (val.resolution_status === "unresolved" || val.resolution_status === "ambiguous") {
      if (val.resolution_confidence.level === "known") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resolution_confidence", "level"],
          message: "unresolved/ambiguous entities must not be marked as known"
        });
      }
    }
  });

export function isAmbiguousEntity(ref: EntityRef): boolean {
  return ref.resolution_status === "ambiguous" || ref.resolution_status === "unresolved";
}
