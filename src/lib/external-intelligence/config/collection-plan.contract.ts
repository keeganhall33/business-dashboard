import { z } from "zod";

import type { SourceEligibilityResult } from "@/lib/external-intelligence/config/evaluate-source-eligibility";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const CollectionModeSchema = z.enum(["automated", "manual", "metadata_only"]);

export const CollectionPlanSchema = z
  .object({
    collection_plan_id: z.string().min(8).max(128),

    source_id: z.string().min(3).max(128),
    source_config_version: z.string().min(1).max(64),

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

    collection_mode: CollectionModeSchema,
    access_method: z.string().min(1).max(64),
    cadence: z.string().min(1).max(32),
    freshness_threshold: z.string().min(1).max(32),

    permitted_artifact_types: z.array(z.string().min(1).max(64)).min(1),
    retention_policy: z.enum(["retain", "link_only", "tombstone"]),
    legal_restrictions: z.array(z.string().min(1).max(200)).default([]),

    expected_outputs: z.array(z.string().min(1).max(64)).min(1),

    eligibility_evaluation: z.custom<SourceEligibilityResult>(),

    created_at: z.string().datetime(),
    expires_at: z.string().datetime()
  })
  .strict();

export type CollectionPlan = z.infer<typeof CollectionPlanSchema>;

export function parseCollectionPlan(json: unknown): CollectionPlan {
  const parsed = CollectionPlanSchema.parse(json);

  // Fail-closed: plans cannot exist for ineligible sources.
  const eligibility = parsed.eligibility_evaluation as any as SourceEligibilityResult;
  if (!eligibility.allowed) {
    throw new Error("collection_plan_ineligible");
  }

  // Fail-closed: expiration required.
  if (Date.parse(parsed.expires_at) <= Date.parse(parsed.created_at)) {
    throw new Error("collection_plan_invalid_expiration");
  }

  return parsed;
}

export function createCollectionPlanHash(plan: CollectionPlan): string {
  return sha256CanonicalJson({
    v: "collection-plan/v1",
    source_id: plan.source_id,
    source_config_version: plan.source_config_version,
    registry_hash: plan.registry_hash,
    source_sets_hash: plan.source_sets_hash,
    policy_refs: plan.policy_refs,
    collection_mode: plan.collection_mode,
    access_method: plan.access_method,
    cadence: plan.cadence,
    freshness_threshold: plan.freshness_threshold,
    permitted_artifact_types: [...plan.permitted_artifact_types],
    retention_policy: plan.retention_policy,
    legal_restrictions: plan.legal_restrictions,
    expected_outputs: plan.expected_outputs,
    eligibility_fingerprint: (plan.eligibility_evaluation as any as SourceEligibilityResult).evaluation_fingerprint,
    expires_at: plan.expires_at
  });
}
