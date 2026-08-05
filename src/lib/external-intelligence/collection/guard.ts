import { parseCollectionPlan } from "@/lib/external-intelligence/config/collection-plan.contract";
import type { SourceEligibilityResult } from "@/lib/external-intelligence/config/evaluate-source-eligibility";
import type { ProductionSourceRegistryEntry } from "@/lib/external-intelligence/config/production-source-registry.contract";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import type { CollectionRequest } from "@/lib/external-intelligence/collection/contracts";

export type GuardDeps = {
  source: ProductionSourceRegistryEntry;
  eligibility: SourceEligibilityResult;
  policy_refs: PolicyRef[];

  adapter_source_id: string;
  adapter_operational: boolean;
  credentials_available: boolean;
  retention_capable: boolean;
  environment_approved_for_collection: boolean;
};

export type GuardResult = {
  ok: boolean;
  error: { code: string; message: string } | null;
};

export function guardCollectionExecution(input: { req: CollectionRequest; deps: GuardDeps }): GuardResult {
  const { req, deps } = input;

  // Plan must validate.
  try {
    parseCollectionPlan(req.plan);
  } catch (err) {
    return { ok: false, error: { code: "PLAN_INVALID", message: String((err as Error).message) } };
  }

  // Plan must not be expired.
  if (Date.parse(req.plan.expires_at) <= Date.now()) {
    return { ok: false, error: { code: "PLAN_EXPIRED", message: "collection plan expired" } };
  }

  if (!deps.eligibility.allowed_now) {
    return { ok: false, error: { code: "ELIGIBILITY_NOT_ALLOWED_NOW", message: "source not eligible now" } };
  }

  if (!deps.eligibility.currently_allowed_modes.includes(req.plan.collection_mode)) {
    return { ok: false, error: { code: "MODE_NOT_ALLOWED_NOW", message: "requested mode not currently allowed" } };
  }

  // Exact pins.
  if (req.source_id !== deps.source.source_id) {
    return { ok: false, error: { code: "SOURCE_VERSION_MISMATCH", message: "source_id mismatch" } };
  }
  if (req.plan.source_config_version !== deps.source.source_config_version) {
    return { ok: false, error: { code: "SOURCE_VERSION_MISMATCH", message: "source_config_version mismatch" } };
  }
  if (req.registry_hash !== deps.eligibility.governing_registry_hash) {
    return { ok: false, error: { code: "REGISTRY_HASH_MISMATCH", message: "registry_hash mismatch" } };
  }

  // Policy pins must match exactly.
  const pinsA = deps.eligibility.governing_policy_refs
    .map((p) => `${p.policy_name}@${p.semantic_version}:${p.content_hash}`)
    .slice()
    .sort();
  const pinsB = deps.policy_refs.map((p) => `${p.policy_name}@${p.semantic_version}:${p.content_hash}`).slice().sort();
  if (pinsA.join("|") !== pinsB.join("|")) {
    return { ok: false, error: { code: "POLICY_PINS_MISMATCH", message: "policy pins mismatch" } };
  }

  // Environment must be explicitly approved.
  if (!deps.environment_approved_for_collection) {
    return { ok: false, error: { code: "ELIGIBILITY_NOT_ALLOWED_NOW", message: "environment not approved" } };
  }

  // Adapter invariants.
  if (deps.adapter_source_id !== deps.source.source_id) {
    return { ok: false, error: { code: "ADAPTER_MISMATCH", message: "adapter source mismatch" } };
  }
  if (!deps.adapter_operational) {
    return { ok: false, error: { code: "ADAPTER_NOT_OPERATIONAL", message: "adapter not operational" } };
  }

  if (deps.source.authentication_required && !deps.credentials_available) {
    return { ok: false, error: { code: "CREDENTIAL_MISSING", message: "credentials missing" } };
  }

  if (!deps.retention_capable) {
    return { ok: false, error: { code: "RETENTION_UNSUPPORTED", message: "retention capability missing" } };
  }

  return deepFreeze({ ok: true, error: null });
}
