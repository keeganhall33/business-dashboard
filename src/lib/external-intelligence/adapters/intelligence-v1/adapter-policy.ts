import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import { createPolicyRefContentHash } from "@/lib/external-intelligence/hashing/content-hash";

export const INTELLIGENCE_V1_ADAPTER_POLICY_NAME = "external-intelligence/intelligence-v1-adapters" as const;
export const INTELLIGENCE_V1_ADAPTER_POLICY_VERSION = "v1.0.0" as const;

const semanticPolicy = {
  schema_version: "adapter_policy_v1",
  policy_name: INTELLIGENCE_V1_ADAPTER_POLICY_NAME,
  semantic_version: INTELLIGENCE_V1_ADAPTER_POLICY_VERSION,
  effective_from: "2026-08-04",
  effective_until: null,
  approval_status: "approved",
  approved_by: "architecture",

  // excluded from hashing by policy hash helper
  changed_at: null,
  change_reason: "Initial adapter policy for deterministic internal→versioned reference adapters.",

  rules: {
    fail_closed: true,
    preserve_internal_semantics: true,
    no_semantic_collapse_internal_to_external: true,
    confidence_mapping_lossy: true
  },

  supported_source_contracts: {
    intelligence_v1: "v1" as const,
    explanation_confidence: "v1" as const
  }
} as const;

export const INTELLIGENCE_V1_ADAPTER_POLICY_REF: PolicyRef = {
  policy_name: semanticPolicy.policy_name,
  semantic_version: semanticPolicy.semantic_version,
  content_hash: createPolicyRefContentHash(semanticPolicy),
  effective_from: semanticPolicy.effective_from,
  effective_until: semanticPolicy.effective_until,
  approval_status: semanticPolicy.approval_status,
  approved_by: semanticPolicy.approved_by,
  changed_at: semanticPolicy.changed_at,
  change_reason: semanticPolicy.change_reason
};

export const INTELLIGENCE_V1_ADAPTER_POLICY_HASH_SEMANTIC_INPUT = semanticPolicy;
