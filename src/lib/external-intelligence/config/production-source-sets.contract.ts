import { z } from "zod";

import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

const SourceIdSchema = z.string().min(3).max(128);
const SourceSetIdSchema = z.string().min(3).max(128);
const VersionSchema = z.string().min(1).max(64);

export const ProductionSourceSetLifecycleSchema = z.enum(["proposed", "active", "paused", "retired"]);

export const ProductionSourceSetSchema = z
  .object({
    schema_version: z.literal("production_source_sets_v1"),

    source_set_id: SourceSetIdSchema,
    version: VersionSchema,
    owner: z.string().min(1).max(64),
    purpose: z.string().min(1).max(300),
    domains: z.array(z.string().min(1).max(64)).min(1),

    maximum_active_members: z.number().int().min(1).max(200),
    diversity_requirement: z.string().min(1).max(240),
    legal_access_policy: z.string().min(1).max(240),
    duplicate_handling_policy: z.string().min(1).max(240),
    update_cadence: z.enum(["weekly", "monthly", "quarterly"]),
    review_cadence: z.enum(["monthly", "quarterly", "semiannual"]),
    noise_budget: z.enum(["low", "medium", "high"]),

    inclusion_reasons: z.array(z.string().min(1).max(160)).min(1),
    member_roles: z.array(z.string().min(1).max(64)).min(1),

    // Membership never enables a source; this flag is informational only.
    members: z
      .array(
        z
          .object({
            source_id: SourceIdSchema,
            role: z.string().min(1).max(64),
            member_enabled: z.boolean(),
            inclusion_reason: z.string().min(1).max(200)
          })
          .strict()
      )
      .min(1),

    replacement_rules: z.string().min(1).max(240),
    lifecycle_status: ProductionSourceSetLifecycleSchema
  })
  .strict();

export const ProductionSourceSetsFileSchema = z
  .object({
    schema_version: z.literal("production_source_sets_v1"),
    source_sets_config_version: VersionSchema,
    generated_at: z.string().datetime().nullable(),
    fixture_status: z.literal("production"),
    production_eligibility: z.literal("enabled"),
    owner: z.string().min(1).max(64),
    source_sets: z.array(ProductionSourceSetSchema).min(1)
  })
  .strict();

export type ProductionSourceSet = z.infer<typeof ProductionSourceSetSchema>;
export type ProductionSourceSetsFile = z.infer<typeof ProductionSourceSetsFileSchema>;

export function parseProductionSourceSetsFile(json: unknown): ProductionSourceSetsFile {
  const parsed = ProductionSourceSetsFileSchema.parse(json);

  parsed.source_sets.sort((a, b) => a.source_set_id.localeCompare(b.source_set_id));
  for (const s of parsed.source_sets) {
    s.domains = [...new Set(s.domains)].sort((a, b) => a.localeCompare(b));
    s.member_roles = [...new Set(s.member_roles)].sort((a, b) => a.localeCompare(b));
    s.members.sort((a, b) => a.source_id.localeCompare(b.source_id));
  }

  return parsed;
}

export function createProductionSourceSetsHash(file: ProductionSourceSetsFile): string {
  const { generated_at, ...rest } = file;
  void generated_at;
  return sha256CanonicalJson(rest);
}
