import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import type { ProductionSourceRegistryEntry } from "@/lib/external-intelligence/config/production-source-registry.contract";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export type CollectionEnvironment = "production" | "staging" | "local";

export type CollectionMode = "automated" | "manual" | "metadata_only";

export type SourceEligibilityResult = {
  allowed: boolean;
  allowed_modes: Array<"automated" | "manual" | "metadata_only" | "disabled">;
  blocking_reasons: string[];
  warnings: string[];
  review_required: boolean;
  review_by: string | null;

  governing_source_config_version: string;
  governing_registry_version: string;
  governing_policy_refs: PolicyRef[];

  evaluation_fingerprint: string;
};

function fingerprintFor(input: {
  source_id: string;
  env: CollectionEnvironment;
  requested_mode: CollectionMode;
  registry_hash: string;
  source_sets_hash: string;
  policy_refs: PolicyRef[];
  blocking_reasons: string[];
  warnings: string[];
}): string {
  return sha256CanonicalJson({
    v: "eligibility/v1",
    source_id: input.source_id,
    env: input.env,
    requested_mode: input.requested_mode,
    registry_hash: input.registry_hash,
    source_sets_hash: input.source_sets_hash,
    policy_refs: input.policy_refs.map((p) => ({
      policy_name: p.policy_name,
      semantic_version: p.semantic_version,
      content_hash: p.content_hash
    })),
    blocking_reasons: input.blocking_reasons,
    warnings: input.warnings
  });
}

/**
 * Canonical production eligibility evaluator (authoritative).
 *
 * Fail-closed: any unknown/missing/unsafe state blocks automated collection.
 * This function is the single source of truth for eligibility rules.
 */
export function evaluateSourceEligibility(input: {
  env: CollectionEnvironment;
  source: ProductionSourceRegistryEntry;
  requested_mode: CollectionMode;

  registry_hash: string;
  registry_version: string;
  source_sets_hash: string;
  policy_refs: PolicyRef[];

  // External runtime facts (explicit; no implicit env reads)
  authentication_available: boolean;
  licensing_satisfied: boolean;
  paywall_satisfied: boolean;
  legal_review_current: boolean;
  retention_honorable: boolean;
  environment_approved_for_collection: boolean;
}): SourceEligibilityResult {
  const blocking_reasons: string[] = [];
  const warnings: string[] = [];

  // Unknown/malformed states are blocked by schema validation upstream.

  // Explicit governance gates.
  if (!input.source.enabled) blocking_reasons.push("source_disabled");

  if (["proposed", "paused", "retired", "replaced"].includes(input.source.lifecycle_status)) {
    blocking_reasons.push(`lifecycle_block:${input.source.lifecycle_status}`);
  }

  if (input.source.implementation_status !== "operational") {
    blocking_reasons.push(`implementation_not_operational:${input.source.implementation_status}`);
  }

  if (input.source.terms_review_status === "not_reviewed") blocking_reasons.push("terms_not_reviewed");
  if (input.source.terms_review_status === "restricted" && input.source.approved_fallback_method === "disabled") {
    blocking_reasons.push("terms_restricted_no_approved_method");
  }
  if (input.source.terms_review_status === "prohibited") blocking_reasons.push("terms_prohibited");

  if (input.source.automation_suitability === "prohibited") blocking_reasons.push("automation_prohibited");

  if (input.source.authentication_required && !input.authentication_available) {
    blocking_reasons.push("authentication_required_unavailable");
  }
  if (input.source.paywalled && !input.paywall_satisfied) blocking_reasons.push("paywall_unsatisfied");
  if (input.source.licensing_required && !input.licensing_satisfied) blocking_reasons.push("licensing_unsatisfied");

  if (!input.legal_review_current) blocking_reasons.push("legal_review_expired_or_missing");

  if (["broken", "revoked"].includes(input.source.access_status)) {
    blocking_reasons.push(`access_status_block:${input.source.access_status}`);
  }

  if (!input.retention_honorable) blocking_reasons.push("retention_unhonorable");

  // Policies must be present and pinned.
  if (input.policy_refs.length === 0) blocking_reasons.push("required_policy_missing");

  // Environment must be explicitly approved for collection.
  if (!input.environment_approved_for_collection) blocking_reasons.push("environment_not_approved");

  // Terms approval never overrides other blockers.
  if (input.source.terms_review_status === "approved" && blocking_reasons.length > 0) {
    warnings.push("terms_approved_but_other_blockers_present");
  }

  // Mode gating.
  const allowed_modes: SourceEligibilityResult["allowed_modes"] = [];

  const automatedBlocked =
    blocking_reasons.length > 0 ||
    input.source.automation_suitability !== "allowed" ||
    input.requested_mode !== "automated";

  if (!automatedBlocked) allowed_modes.push("automated");

  // Manual may remain possible only when explicitly permitted.
  const manualPermitted =
    !["prohibited"].includes(input.source.terms_review_status) &&
    input.source.approved_fallback_method === "manual_review" &&
    input.source.automation_suitability !== "prohibited";

  if (manualPermitted) allowed_modes.push("manual");

  const metadataPermitted =
    input.source.automation_suitability === "metadata_only" && input.source.approved_fallback_method === "metadata_only";

  if (metadataPermitted) allowed_modes.push("metadata_only");

  if (allowed_modes.length === 0) allowed_modes.push("disabled");

  const allowed = allowed_modes.includes(input.requested_mode);

  const review_required = input.source.terms_review_status !== "approved";

  const evaluation_fingerprint = fingerprintFor({
    source_id: input.source.source_id,
    env: input.env,
    requested_mode: input.requested_mode,
    registry_hash: input.registry_hash,
    source_sets_hash: input.source_sets_hash,
    policy_refs: input.policy_refs,
    blocking_reasons,
    warnings
  });

  return {
    allowed,
    allowed_modes,
    blocking_reasons,
    warnings,
    review_required,
    review_by: input.source.review_by,
    governing_source_config_version: input.source.source_config_version,
    governing_registry_version: input.registry_version,
    governing_policy_refs: input.policy_refs,
    evaluation_fingerprint
  };
}
