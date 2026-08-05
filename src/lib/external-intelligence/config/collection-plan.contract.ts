import { z } from "zod";

import type { SourceEligibilityResult } from "@/lib/external-intelligence/config/evaluate-source-eligibility";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const CollectionModeSchema = z.enum(["automated", "manual", "metadata_only"]);

const EligibilitySchema = z
  .object({
    allowed: z.boolean(),
    allowed_now: z.boolean(),
    currently_allowed_modes: z.array(z.enum(["automated", "manual", "metadata_only"])),

    potentially_permitted_modes: z.array(z.enum(["automated", "manual", "metadata_only"])),
    pathway_requirements_by_mode: z.object({ automated: z.array(z.string()), manual: z.array(z.string()), metadata_only: z.array(z.string()) }).strict(),

    universal_blockers: z.array(z.string()),
    mode_specific_blockers: z.object({ automated: z.array(z.string()), manual: z.array(z.string()), metadata_only: z.array(z.string()) }).strict(),

    blocking_reasons: z.array(z.string()),
    warnings: z.array(z.string()),

    review_required: z.boolean(),
    review_by: z.string().nullable(),

    lifecycle_status: z.string(),
    implementation_status: z.string(),
    access_status: z.string(),

    governing_source_config_version: z.string(),
    governing_registry_version: z.string(),
    governing_registry_hash: z.string(),
    governing_source_sets_hash: z.string(),
    governing_policy_refs: z.array(
      z
        .object({
          policy_name: z.string(),
          semantic_version: z.string(),
          content_hash: z.string()
        })
        .strict()
    ),

    evaluation_fingerprint: z.string()
  })
  .strict();

export const CollectionPlanSchema = z
  .object({
    collection_plan_id: z.string().min(8).max(128),

    source_id: z.string().min(3).max(128),
    source_config_version: z.string().min(1).max(64),
    registry_schema_version: z.string().min(1).max(64),

    registry_hash: z.string().min(8).max(128),
    source_sets_hash: z.string().min(8).max(128),

    policy_refs: z
      .array(
        z
          .object({
            policy_name: z.string().min(1).max(64),
            semantic_version: z.string().min(1).max(64),
            content_hash: z.string().min(8).max(128)
          })
          .strict()
      )
      .min(1),

    eligibility_evaluation: EligibilitySchema,

    collection_mode: CollectionModeSchema,
    access_method: z.string().min(1).max(64),
    expected_cadence: z.string().min(1).max(32),
    freshness_threshold: z.string().min(1).max(32),

    permitted_artifact_types: z.array(z.string().min(1).max(64)).min(1),
    retention_policy: z.enum(["retain", "link_only", "tombstone"]),
    legal_restrictions: z.array(z.string().min(1).max(200)).default([]),

    expected_outputs: z.array(z.string().min(1).max(64)).min(1),

    created_at: z.string().datetime(),
    expires_at: z.string().datetime()
  })
  .strict();

export type CollectionPlan = z.infer<typeof CollectionPlanSchema>;

export function parseCollectionPlan(json: unknown): CollectionPlan {
  const parsed = CollectionPlanSchema.parse(json);

  const eligibility = parsed.eligibility_evaluation as unknown as SourceEligibilityResult;

  // Fail-closed: plans cannot exist for sources that are not currently eligible now.
  if (!eligibility.allowed_now) {
    throw new Error("collection_plan_ineligible_now");
  }

  // Fail-closed: requested mode must be currently allowed.
  if (!eligibility.currently_allowed_modes.includes(parsed.collection_mode)) {
    throw new Error("collection_plan_mode_not_currently_allowed");
  }

  // Fail-closed: expiration required.
  if (Date.parse(parsed.expires_at) <= Date.parse(parsed.created_at)) {
    throw new Error("collection_plan_invalid_expiration");
  }

  return parsed;
}

export function createCollectionPlanHash(plan: CollectionPlan): string {
  return sha256CanonicalJson({
    v: "collection-plan/v2",
    source_id: plan.source_id,
    source_config_version: plan.source_config_version,
    registry_schema_version: plan.registry_schema_version,
    registry_hash: plan.registry_hash,
    source_sets_hash: plan.source_sets_hash,
    policy_refs: plan.policy_refs,
    collection_mode: plan.collection_mode,
    access_method: plan.access_method,
    expected_cadence: plan.expected_cadence,
    freshness_threshold: plan.freshness_threshold,
    permitted_artifact_types: [...plan.permitted_artifact_types],
    retention_policy: plan.retention_policy,
    legal_restrictions: plan.legal_restrictions,
    expected_outputs: plan.expected_outputs,
    eligibility_fingerprint: (plan.eligibility_evaluation as unknown as SourceEligibilityResult).evaluation_fingerprint,
    expires_at: plan.expires_at
  });
}
