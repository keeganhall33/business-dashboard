import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import type { ProductionSourceRegistryEntry } from "@/lib/external-intelligence/config/production-source-registry.contract";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export type CollectionEnvironment = "production" | "staging" | "local";

export type CollectionMode = "automated" | "manual" | "metadata_only";

export type SourceEligibilityResult = {
  /** Whether the requested mode is currently permitted now. */
  allowed: boolean;

  /** Current collection eligibility (independent of requested_mode). */
  allowed_now: boolean;
  currently_allowed_modes: Array<"automated" | "manual" | "metadata_only">;

  /** Potential pathways after blockers are resolved (not current eligibility). */
  potentially_permitted_modes: Array<"automated" | "manual" | "metadata_only">;
  pathway_requirements_by_mode: Record<"automated" | "manual" | "metadata_only", string[]>;

  /** Universal blockers apply to every current collection mode. */
  universal_blockers: string[];

  /** Mode-specific blockers apply only to a particular mode. */
  mode_specific_blockers: Record<"automated" | "manual" | "metadata_only", string[]>;

  /** Convenience union of universal + mode-specific blockers. */
  blocking_reasons: string[];
  warnings: string[];

  review_required: boolean;
  review_by: string | null;

  lifecycle_status: ProductionSourceRegistryEntry["lifecycle_status"];
  implementation_status: ProductionSourceRegistryEntry["implementation_status"];
  access_status: ProductionSourceRegistryEntry["access_status"];

  governing_source_config_version: string;
  governing_registry_version: string;
  governing_registry_hash: string;
  governing_source_sets_hash: string;
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
  universal_blockers: string[];
  mode_specific_blockers: Record<"automated" | "manual" | "metadata_only", string[]>;
  warnings: string[];
}): string {
  return sha256CanonicalJson({
    v: "eligibility/v2",
    source_id: input.source_id,
    env: input.env,
    requested_mode: input.requested_mode,
    registry_hash: input.registry_hash,
    source_sets_hash: input.source_sets_hash,
    policy_refs: input.policy_refs
      .map((p) => ({
        policy_name: p.policy_name,
        semantic_version: p.semantic_version,
        content_hash: p.content_hash
      }))
      .sort((a, b) => `${a.policy_name}@${a.semantic_version}`.localeCompare(`${b.policy_name}@${b.semantic_version}`)),
    universal_blockers: input.universal_blockers,
    mode_specific_blockers: input.mode_specific_blockers,
    warnings: input.warnings
  });
}

/**
 * Canonical production eligibility evaluator (authoritative).
 *
 * It answers: "Can this source be collected through this method, in this environment, right now?"
 *
 * Fail-closed:
 * - Universal blockers shut down every current mode.
 * - Potential pathways are reported separately and must never be treated as current eligibility.
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
  const universal_blockers: string[] = [];
  const mode_specific_blockers: SourceEligibilityResult["mode_specific_blockers"] = {
    automated: [],
    manual: [],
    metadata_only: []
  };
  const warnings: string[] = [];

  // Universal governance gates.
  if (!input.source.enabled) universal_blockers.push("source_disabled");

  if (["proposed", "paused", "retired", "replaced"].includes(input.source.lifecycle_status)) {
    universal_blockers.push(`lifecycle_block:${input.source.lifecycle_status}`);
  }

  if (input.source.implementation_status !== "operational") {
    universal_blockers.push(`implementation_not_operational:${input.source.implementation_status}`);
  }

  // Terms are universal blockers unless fully reviewed and permissible.
  if (input.source.terms_review_status === "not_reviewed") universal_blockers.push("terms_not_reviewed");
  if (input.source.terms_review_status === "restricted" && input.source.approved_fallback_method === "disabled") {
    universal_blockers.push("terms_restricted_no_approved_method");
  }
  if (input.source.terms_review_status === "prohibited") universal_blockers.push("terms_prohibited");

  if (!input.legal_review_current) universal_blockers.push("legal_review_expired_or_missing");

  if (["revoked"].includes(input.source.access_status)) {
    universal_blockers.push(`access_status_block:${input.source.access_status}`);
  }

  if (!input.retention_honorable) universal_blockers.push("retention_unhonorable");

  // Policies must be present and pinned.
  if (input.policy_refs.length === 0) universal_blockers.push("required_policy_missing");

  // Environment must be explicitly approved for any current collection.
  if (!input.environment_approved_for_collection) universal_blockers.push("environment_not_approved");

  // Mode-specific gates.
  if (["broken"].includes(input.source.access_status)) {
    // Broken access blocks current automated. A separately approved manual method could exist later.
    mode_specific_blockers.automated.push(`access_status_block:${input.source.access_status}`);
  }

  if (input.source.automation_suitability === "manual_only") {
    mode_specific_blockers.automated.push("automation_manual_only");
    mode_specific_blockers.metadata_only.push("automation_manual_only");
  }
  if (input.source.automation_suitability === "metadata_only") {
    mode_specific_blockers.automated.push("automation_metadata_only");
    mode_specific_blockers.manual.push("automation_metadata_only");
  }
  if (input.source.automation_suitability === "prohibited") {
    mode_specific_blockers.automated.push("automation_prohibited");
  }

  if (input.source.authentication_required && !input.authentication_available) {
    mode_specific_blockers.automated.push("authentication_required_unavailable");
  }
  if (input.source.paywalled && !input.paywall_satisfied) mode_specific_blockers.automated.push("paywall_unsatisfied");
  if (input.source.licensing_required && !input.licensing_satisfied) mode_specific_blockers.automated.push("licensing_unsatisfied");

  // Current eligibility: universal blockers shut down every mode.
  const currently_allowed_modes: Array<"automated" | "manual" | "metadata_only"> = [];
  if (universal_blockers.length === 0) {
    const automatedOk =
      mode_specific_blockers.automated.length === 0 && input.source.automation_suitability === "allowed";
    const manualOk = mode_specific_blockers.manual.length === 0;
    const metadataOk = mode_specific_blockers.metadata_only.length === 0;

    if (automatedOk) currently_allowed_modes.push("automated");
    if (manualOk) currently_allowed_modes.push("manual");
    if (metadataOk) currently_allowed_modes.push("metadata_only");
  }

  const allowed_now = currently_allowed_modes.length > 0;
  const allowed = currently_allowed_modes.includes(input.requested_mode);

  // Potential pathways (separate from current eligibility).
  const potentially_permitted_modes: Array<"automated" | "manual" | "metadata_only"> = [];
  const pathway_requirements_by_mode: SourceEligibilityResult["pathway_requirements_by_mode"] = {
    automated: [],
    manual: [],
    metadata_only: []
  };

  if (input.source.terms_review_status !== "prohibited") {
    if (input.source.approved_fallback_method === "manual_review") {
      potentially_permitted_modes.push("manual");
      pathway_requirements_by_mode.manual.push("enable_source");
      pathway_requirements_by_mode.manual.push("implementation_operational");
      pathway_requirements_by_mode.manual.push("terms_review_approved_or_restricted_with_method");
      pathway_requirements_by_mode.manual.push("legal_review_current");
      pathway_requirements_by_mode.manual.push("environment_approved");
    }

    if (input.source.approved_fallback_method === "metadata_only") {
      potentially_permitted_modes.push("metadata_only");
      pathway_requirements_by_mode.metadata_only.push("enable_source");
      pathway_requirements_by_mode.metadata_only.push("implementation_operational");
      pathway_requirements_by_mode.metadata_only.push("terms_review_approved_or_restricted_with_method");
      pathway_requirements_by_mode.metadata_only.push("legal_review_current");
      pathway_requirements_by_mode.metadata_only.push("environment_approved");
    }

    if (input.source.automation_suitability === "allowed") {
      potentially_permitted_modes.push("automated");
      pathway_requirements_by_mode.automated.push("enable_source");
      pathway_requirements_by_mode.automated.push("implementation_operational");
      pathway_requirements_by_mode.automated.push("terms_review_approved_or_restricted_with_method");
      pathway_requirements_by_mode.automated.push("legal_review_current");
      pathway_requirements_by_mode.automated.push("environment_approved");
      if (input.source.authentication_required) pathway_requirements_by_mode.automated.push("authentication_available");
      if (input.source.paywalled) pathway_requirements_by_mode.automated.push("paywall_satisfied");
      if (input.source.licensing_required) pathway_requirements_by_mode.automated.push("licensing_satisfied");
    }
  }

  const combinedBlockersForWarning = [...universal_blockers, ...Object.values(mode_specific_blockers).flat()];
  if (input.source.terms_review_status === "approved" && combinedBlockersForWarning.length > 0) {
    warnings.push("terms_approved_but_other_blockers_present");
  }

  const review_required = input.source.terms_review_status !== "approved";

  const normalizedUniversal = universal_blockers.slice().sort((a, b) => a.localeCompare(b));
  const normalizedModeSpecific = {
    automated: mode_specific_blockers.automated.slice().sort((a, b) => a.localeCompare(b)),
    manual: mode_specific_blockers.manual.slice().sort((a, b) => a.localeCompare(b)),
    metadata_only: mode_specific_blockers.metadata_only.slice().sort((a, b) => a.localeCompare(b))
  };

  const evaluation_fingerprint = fingerprintFor({
    source_id: input.source.source_id,
    env: input.env,
    requested_mode: input.requested_mode,
    registry_hash: input.registry_hash,
    source_sets_hash: input.source_sets_hash,
    policy_refs: input.policy_refs,
    universal_blockers: normalizedUniversal,
    mode_specific_blockers: normalizedModeSpecific,
    warnings
  });

  const blocking_reasons = [...normalizedUniversal, ...Object.values(normalizedModeSpecific).flat()].sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    allowed,
    allowed_now,
    currently_allowed_modes: currently_allowed_modes.slice().sort((a, b) => a.localeCompare(b)),

    potentially_permitted_modes: [...new Set(potentially_permitted_modes)].sort((a, b) => a.localeCompare(b)),
    pathway_requirements_by_mode: {
      automated: pathway_requirements_by_mode.automated.slice().sort((a, b) => a.localeCompare(b)),
      manual: pathway_requirements_by_mode.manual.slice().sort((a, b) => a.localeCompare(b)),
      metadata_only: pathway_requirements_by_mode.metadata_only.slice().sort((a, b) => a.localeCompare(b))
    },

    universal_blockers: normalizedUniversal,
    mode_specific_blockers: normalizedModeSpecific,

    blocking_reasons,
    warnings,
    review_required,
    review_by: input.source.review_by,

    lifecycle_status: input.source.lifecycle_status,
    implementation_status: input.source.implementation_status,
    access_status: input.source.access_status,

    governing_source_config_version: input.source.source_config_version,
    governing_registry_version: input.registry_version,
    governing_registry_hash: input.registry_hash,
    governing_source_sets_hash: input.source_sets_hash,
    governing_policy_refs: input.policy_refs,

    evaluation_fingerprint
  };
}
