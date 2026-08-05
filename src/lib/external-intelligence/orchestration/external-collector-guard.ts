import "@/lib/server-only";

import { parseCollectionPlan } from "@/lib/external-intelligence/config/collection-plan.contract";
import { evaluateSourceEligibility } from "@/lib/external-intelligence/config/evaluate-source-eligibility";
import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";

export type ExternalCollectionJobCategory = "external_collection";

export type ExternalCollectionJobInput = {
  job_id: string;
  category: ExternalCollectionJobCategory;

  environment: "production" | "staging" | "local";
  source_id: string;
  source_config_version: string;

  schedule_id: string;
  schedule_enabled: boolean;

  collection_plan_id: string;
  collection_plan_json: unknown | null;

  requested_mode: "automated" | "manual" | "metadata_only";

  adapter_source_id: string;
  adapter_operational: boolean;

  // Governance pins.
  governing_registry_hash: string;
  governing_source_sets_hash: string;
  governing_policy_refs: PolicyRef[];

  // Runtime facts.
  credentials_available: boolean;
  retention_supported: boolean;
  legal_review_current: boolean;
  terms_approved: boolean;
  environment_approved_for_collection: boolean;

  // Identity pins.
  input_fingerprint: string;
  schedule_identity: string;
};

export type ExternalCollectorGuardBlockCode =
  | "external_collection_not_activated"
  | "source_not_found"
  | "source_not_currently_eligible"
  | "collection_mode_not_allowed"
  | "schedule_not_enabled"
  | "collection_plan_missing"
  | "collection_plan_expired"
  | "adapter_not_operational"
  | "environment_not_approved"
  | "registry_pin_mismatch"
  | "source_sets_pin_mismatch"
  | "policy_pin_mismatch"
  | "credentials_unavailable"
  | "retention_unsupported"
  | "legal_or_terms_blocked"
  | "job_identity_mismatch";

export type ExternalCollectorGuardResult =
  | { ok: true }
  | {
      ok: false;
      blocker_codes: ExternalCollectorGuardBlockCode[];
      safe_summary: string;
    };

function stableSummary(codes: string[]) {
  return codes.slice().sort().join(",");
}

/**
 * Authoritative external collection execution guard.
 *
 * B3 policy: all external collection is fail-closed.
 */
export function guardExternalCollectorExecutionV1(input: ExternalCollectionJobInput): ExternalCollectorGuardResult {
  const blockers: ExternalCollectorGuardBlockCode[] = [];

  if (input.category !== "external_collection") blockers.push("external_collection_not_activated");

  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();
  const sourceIds = registry.sources.map((s) => s.source_id);
  const { source_sets_hash } = loadProductionSourceSetsV1({ knownSourceIds: sourceIds });

  const source = registry.sources.find((s) => s.source_id === input.source_id) ?? null;
  if (!source) blockers.push("source_not_found");

  if (registry_hash !== input.governing_registry_hash) blockers.push("registry_pin_mismatch");
  if (source_sets_hash !== input.governing_source_sets_hash) blockers.push("source_sets_pin_mismatch");

  // Schedule must be enabled.
  if (!input.schedule_enabled) blockers.push("schedule_not_enabled");

  // Collection plan must exist and validate.
  if (!input.collection_plan_json) {
    blockers.push("collection_plan_missing");
  } else {
    try {
      const plan = parseCollectionPlan(input.collection_plan_json);
      if (plan.collection_plan_id !== input.collection_plan_id) blockers.push("job_identity_mismatch");
      if (plan.collection_mode !== input.requested_mode) blockers.push("job_identity_mismatch");
      // parseCollectionPlan already enforces expiration semantics.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("expiration")) blockers.push("collection_plan_expired");
      else blockers.push("collection_plan_missing");
    }
  }

  // Adapter must be operational and match.
  if (!input.adapter_operational) blockers.push("adapter_not_operational");
  if (input.adapter_source_id !== input.source_id) blockers.push("job_identity_mismatch");

  // Environment approval gate.
  if (!input.environment_approved_for_collection) blockers.push("environment_not_approved");

  // Credentials/retention/terms/legal.
  if (!input.credentials_available) blockers.push("credentials_unavailable");
  if (!input.retention_supported) blockers.push("retention_unsupported");
  if (!input.legal_review_current || !input.terms_approved) blockers.push("legal_or_terms_blocked");

  if (source) {
    const eligibility = evaluateSourceEligibility({
      env: input.environment,
      source,
      requested_mode: input.requested_mode,
      registry_hash,
      registry_version: registry.registry_config_version,
      source_sets_hash,
      policy_refs: input.governing_policy_refs,

      authentication_available: input.credentials_available,
      licensing_satisfied: true,
      paywall_satisfied: true,
      legal_review_current: input.legal_review_current,
      retention_honorable: input.retention_supported,
      environment_approved_for_collection: input.environment_approved_for_collection
    });

    if (!eligibility.allowed_now) blockers.push("source_not_currently_eligible");
    if (!eligibility.currently_allowed_modes.includes(input.requested_mode)) blockers.push("collection_mode_not_allowed");

    const expectedPolicyPins = eligibility.governing_policy_refs
      .map((p) => `${p.policy_name}@${p.semantic_version}:${p.content_hash}`)
      .sort();
    const gotPolicyPins = input.governing_policy_refs
      .map((p) => `${p.policy_name}@${p.semantic_version}:${p.content_hash}`)
      .sort();
    if (expectedPolicyPins.join("|") !== gotPolicyPins.join("|")) blockers.push("policy_pin_mismatch");

    if (eligibility.governing_source_config_version !== input.source_config_version) blockers.push("job_identity_mismatch");
  }

  // Fail-closed B3 boundary.
  blockers.push("external_collection_not_activated");

  const normalized = Array.from(new Set(blockers)).sort();

  if (normalized.length > 0) {
    return {
      ok: false,
      blocker_codes: normalized,
      safe_summary: stableSummary(normalized)
    };
  }

  return { ok: true };
}
