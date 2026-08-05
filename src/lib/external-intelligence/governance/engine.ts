import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import type { LoadedExternalIntelligenceConfig } from "@/lib/external-intelligence/config/load-all";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import {
  SourceGovernanceAuditBundleSchema,
  type SourceGovernanceAuditBundle,
  type SourceGovernanceDecision,
  type SourceSetGovernanceDecision,
  type SourceGovernanceSummary,
  createGovernanceDecisionHash,
  createPolicyBundleHash
} from "@/lib/external-intelligence/governance/contracts";

function countBy(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of items) out[k] = (out[k] ?? 0) + 1;
  return out;
}

function stableSortedKeys(obj: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(obj).sort((a, b) => a.localeCompare(b))) out[k] = obj[k]!;
  return out;
}

function resolveFixtureDependencyRequirements(input: {
  source_id: string;
  source_sets_memberships: Array<{ source_id: string; source_set_id: string }>;
}): Array<{ depends_on_source_id: string; requirement: string }> {
  // B0: explicit, deterministic dependency rules (no network).
  // - sources in a set named "set.*" depend on the set existing (validated elsewhere)
  // - no cross-source hard deps are assumed in fixtures unless encoded here.
  // This is deliberately conservative: dependencies are empty unless explicitly declared.

  void input;
  return [];
}

export function evaluateSourceGovernanceForFixtureSource(input: {
  cfg: LoadedExternalIntelligenceConfig;
  policy_refs: PolicyRef[];
  source: LoadedExternalIntelligenceConfig["source_registry"]["sources"][number];
}): SourceGovernanceDecision {
  const { cfg, policy_refs, source } = input;

  const blocking: string[] = [];
  const warnings: string[] = [];

  // Fail-closed: fixture bundle is production-disabled.
  blocking.push("fixture_bundle_production_disabled");

  // Source-level blocking.
  if (!source.enabled) blocking.push("source_disabled");
  if (!source.enabled_by_default) {
    // informational only; do not block by itself.
  }
  const implStatus = String(source.implementation_status);
  if (implStatus !== "operational") blocking.push(`implementation_not_operational:${implStatus}`);
  if (source.terms_review_status !== "approved") blocking.push(`terms_review_status:${source.terms_review_status}`);

  if (source.paywalled) blocking.push("paywalled");
  if (source.licensing_required) blocking.push("licensing_required");
  if (source.authentication_required) blocking.push("authentication_required");

  // Fail-closed: policy refs must be present and pinned.
  if (policy_refs.length === 0) blocking.push("required_policies_missing");

  // Dependencies (explicit only).
  const requirements = resolveFixtureDependencyRequirements({
    source_id: source.source_id,
    source_sets_memberships: cfg.source_sets.memberships
  });

  const dependency_requirements = requirements.map((r) => ({
    depends_on_source_id: r.depends_on_source_id,
    requirement: r.requirement,
    satisfied: false,
    blocking_reason: "dependency_unsatisfied"
  }));

  if (dependency_requirements.length > 0) blocking.push("dependency_unsatisfied");

  const allowed_modes: Array<"automated" | "manual" | "metadata_only" | "disabled"> = ["disabled"];

  const decisionBase = {
    decision_schema_version: "source_governance_decision_v1" as const,
    source_id: source.source_id,
    allowed: false,
    allowed_modes,
    blocking_reasons: blocking.slice().sort((a, b) => a.localeCompare(b)),
    warning_reasons: warnings.slice().sort((a, b) => a.localeCompare(b)),
    review_required: true,
    review_by: null,
    automation_suitability: source.automation_suitability,
    implementation_status: source.implementation_status,
    lifecycle_status: source.lifecycle_status,
    enabled: source.enabled,
    enabled_by_default: source.enabled_by_default,
    production_eligibility: cfg.eligibility_summary.production_eligibility,
    legal_restrictions: [],
    licensing_restrictions: source.licensing_required ? ["licensing_required"] : [],
    paywall_restrictions: source.paywalled ? ["paywalled"] : [],
    required_policies: policy_refs
      .map((p) => ({ policy_name: p.policy_name, semantic_version: p.semantic_version, content_hash: p.content_hash }))
      .sort((a, b) => `${a.policy_name}@${a.semantic_version}`.localeCompare(`${b.policy_name}@${b.semantic_version}`)),
    dependency_requirements,
    registry_content_hash: cfg.registry_content_hash,
    source_sets_content_hash: cfg.source_sets_content_hash,
    policy_bundle_hash: createPolicyBundleHash(policy_refs)
  };

  const decision_hash = createGovernanceDecisionHash({ v: "decision-hash/v1", ...decisionBase });

  return deepFreeze({ ...decisionBase, decision_hash });
}

export function evaluateSourceSetGovernance(input: {
  cfg: LoadedExternalIntelligenceConfig;
  policy_refs: PolicyRef[];
  source_set: LoadedExternalIntelligenceConfig["source_sets"]["source_sets"][number];
}): SourceSetGovernanceDecision {
  const { cfg, policy_refs, source_set } = input;

  const blocking: string[] = [];
  const warnings: string[] = [];

  // Fixture bundle is blocked.
  blocking.push("fixture_bundle_production_disabled");

  // Cap and membership invariants are validated by A2 loader; re-assert fail-closed.
  if (source_set.member_source_ids.length === 0) blocking.push("empty_source_set");
  if (source_set.member_source_ids.length > source_set.maximum_active_members) blocking.push("source_set_cap_exceeded");

  const decisionBase = {
    decision_schema_version: "source_set_governance_decision_v1" as const,
    source_set_id: source_set.source_set_id,
    member_source_ids: source_set.member_source_ids.slice().sort((a, b) => a.localeCompare(b)),
    blocking_reasons: blocking.slice().sort((a, b) => a.localeCompare(b)),
    warning_reasons: warnings.slice().sort((a, b) => a.localeCompare(b)),
    registry_content_hash: cfg.registry_content_hash,
    source_sets_content_hash: cfg.source_sets_content_hash,
    policy_bundle_hash: createPolicyBundleHash(policy_refs)
  };

  const decision_hash = createGovernanceDecisionHash({ v: "set-decision-hash/v1", ...decisionBase });
  return deepFreeze({ ...decisionBase, decision_hash });
}

export function buildSourceGovernanceAuditBundleForFixtures(cfg: LoadedExternalIntelligenceConfig): SourceGovernanceAuditBundle {
  const policy_refs = Object.values(cfg.policy_refs);

  // Deterministic ordering.
  const sources = cfg.source_registry.sources.slice().sort((a, b) => a.source_id.localeCompare(b.source_id));

  const source_decisions = sources.map((s) =>
    evaluateSourceGovernanceForFixtureSource({ cfg, policy_refs, source: s })
  );

  const setDecisions: SourceSetGovernanceDecision[] = cfg.source_sets.source_sets
    .slice()
    .sort((a, b) => a.source_set_id.localeCompare(b.source_set_id))
    .map((set) => evaluateSourceSetGovernance({ cfg, policy_refs, source_set: set }));

  const blockingAll = source_decisions.flatMap((d) => d.blocking_reasons);
  const warningsAll = source_decisions.flatMap((d) => d.warning_reasons);

  const allowedAutomated = source_decisions.filter((d) => d.allowed_modes.includes("automated")).length;
  const allowedManualOnly = source_decisions.filter(
    (d) => d.allowed_modes.includes("manual") && !d.allowed_modes.includes("automated")
  ).length;
  const allowedMetadataOnly = source_decisions.filter(
    (d) => d.allowed_modes.includes("metadata_only") && !d.allowed_modes.includes("automated")
  ).length;
  const fullyBlocked = source_decisions.filter((d) => d.allowed_modes.length === 1 && d.allowed_modes[0] === "disabled").length;

  const summaryBase: Omit<SourceGovernanceSummary, "summary_hash"> = {
    summary_schema_version: "source_governance_summary_v1" as const,
    total_sources: source_decisions.length,
    allowed_automated: allowedAutomated,
    allowed_manual_only: allowedManualOnly,
    allowed_metadata_only: allowedMetadataOnly,
    fully_blocked: fullyBlocked,
    blocking_reason_counts: stableSortedKeys(countBy(blockingAll)),
    warning_reason_counts: stableSortedKeys(countBy(warningsAll)),
    registry_content_hash: cfg.registry_content_hash,
    source_sets_content_hash: cfg.source_sets_content_hash,
    policy_bundle_hash: createPolicyBundleHash(policy_refs)
  };

  const summary_hash = createGovernanceDecisionHash({ v: "summary-hash/v1", ...summaryBase });
  const summary: SourceGovernanceSummary = deepFreeze({ ...summaryBase, summary_hash });

  const bundleBase: Omit<SourceGovernanceAuditBundle, "bundle_hash"> = {
    bundle_schema_version: "source_governance_audit_bundle_v1" as const,
    registry_content_hash: cfg.registry_content_hash,
    source_sets_content_hash: cfg.source_sets_content_hash,
    policy_bundle_hash: createPolicyBundleHash(policy_refs),
    source_decisions,
    source_set_decisions: setDecisions,
    summary
  };

  const bundle_hash = createGovernanceDecisionHash({ v: "bundle-hash/v1", ...bundleBase });
  const bundle: SourceGovernanceAuditBundle = deepFreeze({ ...bundleBase, bundle_hash });

  // Fail-closed validation: ensure schema matches and bundle is immutable.
  SourceGovernanceAuditBundleSchema.parse(bundle);

  return bundle;
}
