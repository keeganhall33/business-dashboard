import { z } from "zod";

import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const GOVERNANCE_HASHING_VERSION = "source-governance/v1" as const;

export const EligibilityModeSchema = z.enum(["automated", "manual", "metadata_only"]);
export type EligibilityMode = z.infer<typeof EligibilityModeSchema>;

export const SourceGovernanceDecisionSchema = z
  .object({
    decision_schema_version: z.literal("source_governance_decision_v1"),

    source_id: z.string().min(1),

    // Overall eligibility.
    allowed: z.boolean(),
    allowed_modes: z.array(z.enum(["automated", "manual", "metadata_only", "disabled"])),

    blocking_reasons: z.array(z.string()),
    warning_reasons: z.array(z.string()),

    review_required: z.boolean(),
    review_by: z.string().nullable(),

    // Governance facts captured in the decision.
    automation_suitability: z.string(),
    implementation_status: z.string(),
    lifecycle_status: z.string(),
    enabled: z.boolean(),
    enabled_by_default: z.boolean(),
    production_eligibility: z.string(),

    legal_restrictions: z.array(z.string()),
    licensing_restrictions: z.array(z.string()),
    paywall_restrictions: z.array(z.string()),

    required_policies: z.array(
      z
        .object({
          policy_name: z.string(),
          semantic_version: z.string(),
          content_hash: z.string()
        })
        .strict()
    ),

    dependency_requirements: z.array(
      z
        .object({
          depends_on_source_id: z.string(),
          requirement: z.string(),
          satisfied: z.boolean(),
          blocking_reason: z.string().nullable()
        })
        .strict()
    ),

    // Deterministic identity and provenance.
    registry_content_hash: z.string(),
    source_sets_content_hash: z.string(),
    policy_bundle_hash: z.string(),

    decision_hash: z.string()
  })
  .strict();

export type SourceGovernanceDecision = z.infer<typeof SourceGovernanceDecisionSchema>;

export const SourceSetGovernanceDecisionSchema = z
  .object({
    decision_schema_version: z.literal("source_set_governance_decision_v1"),

    source_set_id: z.string().min(1),

    // Membership never enables sources; report only.
    member_source_ids: z.array(z.string()),

    blocking_reasons: z.array(z.string()),
    warning_reasons: z.array(z.string()),

    registry_content_hash: z.string(),
    source_sets_content_hash: z.string(),
    policy_bundle_hash: z.string(),

    decision_hash: z.string()
  })
  .strict();

export type SourceSetGovernanceDecision = z.infer<typeof SourceSetGovernanceDecisionSchema>;

export const SourceGovernanceSummarySchema = z
  .object({
    summary_schema_version: z.literal("source_governance_summary_v1"),

    total_sources: z.number().int().min(0),

    allowed_automated: z.number().int().min(0),
    allowed_manual_only: z.number().int().min(0),
    allowed_metadata_only: z.number().int().min(0),
    fully_blocked: z.number().int().min(0),

    blocking_reason_counts: z.record(z.string(), z.number().int().min(1)),
    warning_reason_counts: z.record(z.string(), z.number().int().min(1)),

    registry_content_hash: z.string(),
    source_sets_content_hash: z.string(),
    policy_bundle_hash: z.string(),

    summary_hash: z.string()
  })
  .strict();

export type SourceGovernanceSummary = z.infer<typeof SourceGovernanceSummarySchema>;

export const SourceGovernanceAuditBundleSchema = z
  .object({
    bundle_schema_version: z.literal("source_governance_audit_bundle_v1"),

    registry_content_hash: z.string(),
    source_sets_content_hash: z.string(),
    policy_bundle_hash: z.string(),

    source_decisions: z.array(SourceGovernanceDecisionSchema),
    source_set_decisions: z.array(SourceSetGovernanceDecisionSchema),
    summary: SourceGovernanceSummarySchema,

    bundle_hash: z.string()
  })
  .strict();

export type SourceGovernanceAuditBundle = z.infer<typeof SourceGovernanceAuditBundleSchema>;

export function createPolicyBundleHash(policy_refs: PolicyRef[]): string {
  // Deterministic and fail-closed: requires pinned content hashes.
  const normalized = policy_refs
    .map((p) => ({ policy_name: p.policy_name, semantic_version: p.semantic_version, content_hash: p.content_hash }))
    .sort((a, b) => `${a.policy_name}@${a.semantic_version}`.localeCompare(`${b.policy_name}@${b.semantic_version}`));

  return sha256CanonicalJson({ v: "policy-bundle/v1", policies: normalized });
}

export function createGovernanceDecisionHash(value: unknown): string {
  return sha256CanonicalJson(value);
}
