import { z } from "zod";

import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

const SourceIdSchema = z.string().min(3).max(128);
const VersionSchema = z.string().min(1).max(64);

export const ProductionSourceLifecycleStatusSchema = z.enum([
  "proposed",
  "trial",
  "active",
  "promoted",
  "demoted",
  "paused",
  "retired",
  "replaced"
]);

export const ProductionSourceImplementationStatusSchema = z.enum([
  "unimplemented",
  "adapter_ready",
  "validation_ready",
  "operational",
  "blocked"
]);

export const ProductionSourceAccessStatusSchema = z.enum(["unknown", "working", "degraded", "broken", "revoked"]);

export const ProductionTermsReviewStatusSchema = z.enum(["not_reviewed", "approved", "restricted", "prohibited"]);

export const ProductionAutomationSuitabilitySchema = z.enum(["allowed", "manual_only", "metadata_only", "prohibited"]);

export const ProductionAccessClassificationSchema = z.enum(["public", "credentialed", "licensed", "internal", "restricted"]);

export const ProductionAccessMethodSchema = z.enum([
  "rss",
  "public_web",
  "official_api",
  "structured_export",
  "email_newsroom",
  "manual_review"
]);

export const ProductionCopyrightHandlingSchema = z.enum(["link_only", "excerpt_limited", "no_copy"]);

export const ProductionLegalRiskLevelSchema = z.enum(["low", "medium", "high"]);

export const ProductionCadenceSchema = z.enum(["hourly", "daily", "weekly", "monthly", "quarterly", "ad_hoc"]);

export const ProductionNoiseExpectationSchema = z.enum(["low", "medium", "high"]);

export const ProductionAuthorityLevelSchema = z.enum(["primary", "secondary", "tertiary"]);

export const ProductionSourceTypeSchema = z.enum([
  "official",
  "sports_business",
  "calendar",
  "licensing",
  "competitor",
  "galleries",
  "platform_policy",
  "regulatory",
  "operations",
  "art_market",
  "memorabilia",
  "trading_cards",
  "search_trends",
  "economics",
  "entertainment",
  "music",
  "social"
]);

export const ProductionSourceRegistryEntrySchema = z
  .object({
    // Identity and versioning
    source_id: SourceIdSchema,
    display_name: z.string().min(1).max(160),
    description: z.string().min(1).max(400),
    registry_schema_version: z.literal("production_source_registry_v1"),
    source_config_version: VersionSchema,

    // Canonical lifecycle + enablement separation
    lifecycle_status: ProductionSourceLifecycleStatusSchema,
    enabled: z.boolean(),
    enabled_by_default: z.boolean(),
    implementation_status: ProductionSourceImplementationStatusSchema,
    access_status: ProductionSourceAccessStatusSchema,

    owner: z.string().min(1).max(64),
    review_by: z.string().min(1).max(64).nullable(),
    replacement_source_ids: z.array(SourceIdSchema).default([]),

    // Classification
    domains: z.array(z.string().min(1).max(64)).min(1),
    source_sets: z.array(z.string().min(1).max(64)).default([]),
    source_type: ProductionSourceTypeSchema,
    authority_level: ProductionAuthorityLevelSchema,
    geography: z.string().min(1).max(64),
    languages: z.array(z.string().min(2).max(8)).min(1),
    monitored_entities: z.array(z.string().min(1).max(128)).default([]),

    supported_entity_classes: z.array(z.string().min(1).max(64)).default([]),
    supported_event_classes: z.array(z.string().min(1).max(64)).default([]),
    supported_relationship_classes: z.array(z.string().min(1).max(64)).default([]),
    supported_signal_classes: z.array(z.string().min(1).max(64)).default([]),
    expected_opportunity_classes: z.array(z.string().min(1).max(64)).default([]),
    expected_risk_classes: z.array(z.string().min(1).max(64)).default([]),

    // Access and legality
    access_classification: ProductionAccessClassificationSchema,
    access_method: ProductionAccessMethodSchema,
    authentication_required: z.boolean(),
    paywalled: z.boolean(),
    licensing_required: z.boolean(),
    automation_suitability: ProductionAutomationSuitabilitySchema,
    terms_review_status: ProductionTermsReviewStatusSchema,
    copyright_handling: ProductionCopyrightHandlingSchema,
    data_retention_restrictions: z.array(z.string().min(1).max(160)).default([]),
    approved_fallback_method: z.enum(["manual_review", "metadata_only", "disabled"]).default("disabled"),
    legal_risk_level: ProductionLegalRiskLevelSchema,
    last_legal_review_at: z.string().datetime().nullable(),
    legal_review_owner: z.string().min(1).max(64).nullable(),

    // Operational expectations
    expected_cadence: ProductionCadenceSchema,
    max_acceptable_latency: z.string().min(1).max(16),
    freshness_threshold: z.string().min(1).max(16),
    historical_availability: z.enum(["unknown", "limited", "moderate", "extensive"]).default("unknown"),
    expected_volume: z.enum(["unknown", "low", "medium", "high"]).default("unknown"),
    expected_noise: ProductionNoiseExpectationSchema,
    expected_duplication: ProductionNoiseExpectationSchema,
    implementation_difficulty: z.enum(["low", "medium", "high"]).default("medium"),
    implementation_wave: z.enum(["wave_1", "wave_2", "wave_3", "later"]).default("later"),

    // Manual priors (static)
    credibility_prior: z.enum(["low", "medium", "high"]).default("medium"),
    expected_relevance: z.enum(["low", "medium", "high"]).default("medium"),
    expected_uniqueness: z.enum(["low", "medium", "high"]).default("medium"),
    expected_corroboration_value: z.enum(["low", "medium", "high"]).default("medium")
  })
  .strict();

export const ProductionSourceRegistryFileSchema = z
  .object({
    schema_version: z.literal("production_source_registry_v1"),
    registry_config_version: VersionSchema,
    generated_at: z.string().datetime().nullable(),
    fixture_status: z.literal("production"),
    production_eligibility: z.literal("enabled"),
    owner: z.string().min(1).max(64),
    sources: z.array(ProductionSourceRegistryEntrySchema).min(1)
  })
  .strict();

export type ProductionSourceRegistryEntry = z.infer<typeof ProductionSourceRegistryEntrySchema>;
export type ProductionSourceRegistryFile = z.infer<typeof ProductionSourceRegistryFileSchema>;

export function parseProductionSourceRegistryFile(json: unknown): ProductionSourceRegistryFile {
  const parsed = ProductionSourceRegistryFileSchema.parse(json);

  // Deterministic ordering + set-like normalization.
  parsed.sources.sort((a, b) => a.source_id.localeCompare(b.source_id));
  for (const s of parsed.sources) {
    s.domains = [...new Set(s.domains)].sort((a, b) => a.localeCompare(b));
    s.source_sets = [...new Set(s.source_sets)].sort((a, b) => a.localeCompare(b));
    s.languages = [...new Set(s.languages)].sort((a, b) => a.localeCompare(b));
    s.replacement_source_ids = [...new Set(s.replacement_source_ids)].sort((a, b) => a.localeCompare(b));
  }

  return parsed;
}

export function createProductionSourceRegistryHash(file: ProductionSourceRegistryFile): string {
  // Hash semantic projection only. Exclude generated_at.
  const { generated_at, ...rest } = file;
  void generated_at;
  return sha256CanonicalJson(rest);
}
