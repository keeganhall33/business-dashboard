import path from "node:path";

// Phase A2: canonical repository config paths (no env overrides).

export const EXTERNAL_INTELLIGENCE_CONFIG_ROOT = path.join(process.cwd(), "config");

export const SOURCE_REGISTRY_V1_PATH = path.join(
  EXTERNAL_INTELLIGENCE_CONFIG_ROOT,
  "source-registry",
  "v1",
  "source_registry.json"
);

export const SOURCE_SETS_V1_PATH = path.join(
  EXTERNAL_INTELLIGENCE_CONFIG_ROOT,
  "source-registry",
  "v1",
  "source_sets.json"
);

export const POLICY_ROOT = path.join(EXTERNAL_INTELLIGENCE_CONFIG_ROOT, "policies");

export function policyPath(input: { policy_name: string; semantic_version: string }): string {
  return path.join(POLICY_ROOT, input.policy_name, `${input.semantic_version}.json`);
}
