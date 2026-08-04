import { z } from "zod";

// Phase A2 contracts: strict schemas for configuration artifacts only.

const SemverSchema = z.string().regex(/^v\d+\.\d+\.\d+$/);

const FixtureStatusSchema = z.literal("architecture_fixture");
const ProductionEligibilitySchema = z.literal("disabled");

const LifecycleStatusSchema = z.enum(["proposed", "trial", "active", "paused", "retired"]);
const AutomationSuitabilitySchema = z.enum(["allowed", "manual_only", "prohibited"]);
const TermsReviewStatusSchema = z.enum(["not_reviewed", "approved", "restricted", "prohibited"]);

export const SourceRegistrySourceSchema = z
  .object({
    source_id: z.string().min(1),
    display_name: z.string().min(1),
    description: z.string().min(1),

    registry_schema_version: z.literal("source_registry_v1"),
    source_config_version: SemverSchema,

    lifecycle_status: LifecycleStatusSchema,
    enabled: z.literal(false),
    enabled_by_default: z.literal(false),

    owner: z.string().min(1),
    domains: z.array(z.string().min(1)).min(1),
    source_sets: z.array(z.string().min(1)),

    source_type: z.enum(["official", "industry_reporting", "market_data", "community", "research", "calendar"]),
    authority_level: z.enum(["primary", "secondary", "community"]),

    geography: z.string().min(1),
    languages: z.array(z.string().min(1)).min(1),

    supported_entity_types: z.array(z.string().min(1)),
    supported_event_types: z.array(z.string().min(1)),
    supported_relationship_types: z.array(z.string().min(1)),
    supported_signal_classes: z.array(z.string().min(1)),

    expected_opportunity_classes: z.array(z.string().min(1)),
    expected_risk_classes: z.array(z.string().min(1)),

    access_method: z.string().min(1),
    authentication_required: z.boolean(),
    paywalled: z.boolean(),
    licensing_required: z.boolean(),

    automation_suitability: AutomationSuitabilitySchema,
    terms_review_status: TermsReviewStatusSchema,

    copyright_handling: z.enum(["link_only", "quote_only", "summary_only", "licensed_fulltext"]),
    approved_fallback_method: z.enum(["manual_review"]),
    legal_risk_level: z.enum(["low", "medium", "high"]),

    expected_cadence: z.string().min(1),
    max_acceptable_latency: z.string().min(1),
    freshness_threshold: z.string().min(1),

    expected_noise: z.enum(["low", "medium", "high"]),
    expected_duplication: z.enum(["low", "medium", "high"]),

    implementation_wave: z.enum(["wave_1", "wave_2", "wave_3"]),
    implementation_status: z.literal("unimplemented"),

    credibility_prior: z.enum(["high", "medium", "low"])
  })
  .strict();

export const SourceRegistryFileSchema = z
  .object({
    schema_version: z.literal("source_registry_v1"),
    registry_config_version: SemverSchema,
    generated_at: z.null(),
    fixture_status: FixtureStatusSchema,
    production_eligibility: ProductionEligibilitySchema,
    sources: z.array(SourceRegistrySourceSchema).min(1)
  })
  .strict();

export type SourceRegistryFile = z.infer<typeof SourceRegistryFileSchema>;

export const SourceSetSchema = z
  .object({
    source_set_id: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
    domains: z.array(z.string().min(1)).min(1),
    membership_rules: z.string().min(1),
    maximum_active_members: z.number().int().min(1),
    required_member_diversity: z.string().min(1),
    member_source_ids: z.array(z.string().min(1)).min(1),
    member_status_policy: z.string().min(1),
    individual_credibility_policy: z.string().min(1),
    update_cadence: z.string().min(1),
    review_cadence: z.string().min(1),
    inclusion_reasons: z.array(z.string().min(1)).min(1),
    duplicate_handling_policy: z.string().min(1),
    source_set_owner: z.string().min(1),
    source_set_version: SemverSchema,
    lifecycle_status: LifecycleStatusSchema,
    legal_access_policy: z.string().min(1),
    noise_budget: z.enum(["low", "medium", "high"]),
    replacement_rules: z.string().min(1),
    schema_version: z.literal("source_sets_v1")
  })
  .strict();

export const SourceSetMembershipSchema = z
  .object({
    source_set_id: z.string().min(1),
    source_id: z.string().min(1),
    member_role: z.string().min(1),
    member_enabled: z.boolean(),
    member_inclusion_reason: z.string().min(1)
  })
  .strict();

export const SourceSetsFileSchema = z
  .object({
    schema_version: z.literal("source_sets_v1"),
    source_sets_config_version: SemverSchema,
    generated_at: z.null(),
    fixture_status: FixtureStatusSchema,
    production_eligibility: ProductionEligibilitySchema,
    source_sets: z.array(SourceSetSchema).min(1),
    memberships: z.array(SourceSetMembershipSchema).min(1)
  })
  .strict();

export type SourceSetsFile = z.infer<typeof SourceSetsFileSchema>;

// Policy files (Phase A2 supports only the four fixture policies).

const PolicyBaseSchema = z
  .object({
    schema_version: z.string().min(1),
    policy_name: z.string().min(1),
    semantic_version: SemverSchema,
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effective_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    fixture_status: FixtureStatusSchema,
    production_eligibility: ProductionEligibilitySchema,
    approval_status: z.enum(["draft", "approved", "retired"]),
    approved_by: z.string().min(1).nullable(),
    changed_at: z.null(),
    change_reason: z.string().min(1)
  })
  .strict();

export const ConfidencePolicyFileSchema = PolicyBaseSchema.extend({
  schema_version: z.literal("policy_confidence_v1"),
  policy_name: z.literal("confidence"),
  rules: z
    .object({
      no_fabricated_probabilities: z.literal(true),
      unknown_remains_unknown: z.literal(true),
      overall_is_derived: z.literal(true),
      bounded_levels: z.array(z.enum(["known", "likely", "possible", "rumor", "speculation", "unknown"]))
        .min(1)
        .refine((xs) => new Set(xs).size === xs.length, "bounded_levels must be unique"),
      required_axes: z.array(
        z.enum([
          "evidence",
          "interpretation",
          "business_relevance",
          "mechanism",
          "timing",
          "entity_resolution",
          "overall"
        ])
      )
    })
    .strict()
});

export const DispositionPolicyFileSchema = PolicyBaseSchema.extend({
  schema_version: z.literal("policy_disposition_v1"),
  policy_name: z.literal("disposition"),
  dispositions: z
    .array(
      z.enum([
        "suppress",
        "archive_only",
        "monitor",
        "validate",
        "escalate_to_external_finding",
        "escalate_to_opportunity",
        "send_to_fusion_context"
      ])
    )
    .min(1)
    .refine((xs) => new Set(xs).size === xs.length, "dispositions must be unique"),
  rules: z
    .object({
      popularity_never_sufficient: z.boolean(),
      rumor_monitor_only: z.boolean(),
      one_weak_signal_cannot_create_operating_recommendation: z.boolean(),
      licensing_infeasibility_blocks_actionability: z.boolean()
    })
    .strict()
});

export const LifecyclePolicyFileSchema = PolicyBaseSchema.extend({
  schema_version: z.literal("policy_lifecycle_v1"),
  policy_name: z.literal("lifecycle"),
  signal_lifecycle: z.array(z.string().min(1)).min(1),
  finding_lifecycle: z.array(z.string().min(1)).min(1),
  hypothesis_lifecycle: z.array(z.string().min(1)).min(1)
});

export const SignalInterpretationPolicyFileSchema = PolicyBaseSchema.extend({
  schema_version: z.literal("policy_signal_interpretation_v1"),
  policy_name: z.literal("signal-interpretation"),
  rules: z
    .object({
      require_claim_level_interpretation: z.boolean(),
      raw_evidence_cannot_become_signal: z.boolean(),
      syndication_not_independent: z.boolean(),
      ai_outputs_non_authoritative: z.boolean()
    })
    .strict(),
  fingerprint_inputs: z.array(z.string().min(1)).min(1)
});

export const AnyPolicyFileSchema = z.union([
  ConfidencePolicyFileSchema,
  DispositionPolicyFileSchema,
  LifecyclePolicyFileSchema,
  SignalInterpretationPolicyFileSchema
]);

export type PolicyFile = z.infer<typeof AnyPolicyFileSchema>;

export function assertUniqueIds(input: { kind: string; ids: string[] }) {
  const set = new Set(input.ids);
  if (set.size !== input.ids.length) {
    throw new Error(`${input.kind} contains duplicate ids`);
  }
}
