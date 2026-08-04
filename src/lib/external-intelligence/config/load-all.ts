import { loadSourceRegistryV1 } from "@/lib/external-intelligence/config/load-source-registry";
import { loadSourceSetsV1 } from "@/lib/external-intelligence/config/load-source-sets";
import { loadPolicyFile, type LoadedPolicy } from "@/lib/external-intelligence/config/load-policy";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";

export type LoadedExternalIntelligenceConfig = {
  source_registry: ReturnType<typeof loadSourceRegistryV1>["registry"];
  source_sets: ReturnType<typeof loadSourceSetsV1>["sets"];
  policies: Record<string, LoadedPolicy>;

  registry_content_hash: string;
  source_sets_content_hash: string;

  policy_refs: Record<string, LoadedPolicy["policy_ref"]>;

  eligibility_summary: {
    fixture_status: "architecture_fixture";
    production_eligibility: "disabled";
    blocked: true;
  };

  warnings: string[];
  blocking_reasons: string[];

  // Derived fail-closed safety notes.
  automation_block_reasons_by_source_id: ReturnType<typeof loadSourceRegistryV1>["automation_block_reasons_by_source_id"];
};

export function loadExternalIntelligenceConfigV1(): LoadedExternalIntelligenceConfig {
  const { registry, registry_content_hash, automation_block_reasons_by_source_id } = loadSourceRegistryV1();
  const knownSourceIds = registry.sources.map((s) => s.source_id);

  const { sets, source_sets_content_hash } = loadSourceSetsV1({ knownSourceIds });

  // Deterministic: load the known policy fixtures only (no discovery in A2).
  const toLoad = [
    { policy_name: "confidence", semantic_version: "v1.0.0" },
    { policy_name: "disposition", semantic_version: "v1.0.0" },
    { policy_name: "lifecycle", semantic_version: "v1.0.0" },
    { policy_name: "signal-interpretation", semantic_version: "v1.0.0" }
  ];

  const policies: Record<string, LoadedPolicy> = {};
  for (const p of toLoad) {
    const loaded = loadPolicyFile(p);
    const key = `${loaded.policy_ref.policy_name}@${loaded.policy_ref.semantic_version}`;
    policies[key] = loaded;
  }

  // Deterministic ordering in the returned map: materialize sorted keys.
  const sortedKeys = Object.keys(policies).sort((a, b) => a.localeCompare(b));
  const ordered: Record<string, LoadedPolicy> = {};
  for (const k of sortedKeys) ordered[k] = policies[k]!;

  const policy_refs: Record<string, LoadedPolicy["policy_ref"]> = {};
  for (const k of sortedKeys) policy_refs[k] = ordered[k]!.policy_ref;

  const warnings: string[] = [];
  const blocking_reasons: string[] = [];

  // Fixture bundle is always blocked for production use.
  if (registry.production_eligibility === "disabled") {
    blocking_reasons.push("fixture registry is production-disabled");
  }
  if (sets.production_eligibility === "disabled") {
    blocking_reasons.push("fixture source sets are production-disabled");
  }
  for (const k of sortedKeys) {
    const p = ordered[k]!.file;
    if (p.production_eligibility === "disabled") {
      blocking_reasons.push(`policy ${k} is production-disabled`);
    }
  }

  return deepFreeze({
    source_registry: registry,
    source_sets: sets,
    policies: ordered,
    registry_content_hash,
    source_sets_content_hash,
    policy_refs,
    eligibility_summary: {
      fixture_status: "architecture_fixture",
      production_eligibility: "disabled",
      blocked: true
    },
    warnings,
    blocking_reasons,
    automation_block_reasons_by_source_id
  });
}
