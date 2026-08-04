import { loadSourceRegistryV1 } from "@/lib/external-intelligence/config/load-source-registry";
import { loadSourceSetsV1 } from "@/lib/external-intelligence/config/load-source-sets";
import { loadPolicyFile, type LoadedPolicy } from "@/lib/external-intelligence/config/load-policy";

export type LoadedExternalIntelligenceConfig = {
  source_registry: ReturnType<typeof loadSourceRegistryV1>["registry"];
  source_sets: ReturnType<typeof loadSourceSetsV1>["sets"];
  policies: Record<string, LoadedPolicy>;
};

export function loadExternalIntelligenceConfigV1(): LoadedExternalIntelligenceConfig {
  const { registry } = loadSourceRegistryV1();
  const knownSourceIds = registry.sources.map((s) => s.source_id);

  const { sets } = loadSourceSetsV1({ knownSourceIds });

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

  return { source_registry: registry, source_sets: sets, policies: ordered };
}
