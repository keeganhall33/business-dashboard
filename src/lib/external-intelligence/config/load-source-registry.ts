import fs from "node:fs";

import { SourceRegistryFileSchema, assertUniqueIds } from "@/lib/external-intelligence/config/contracts";
import { SOURCE_REGISTRY_V1_PATH } from "@/lib/external-intelligence/config/paths";
import { createSourceRegistryContentHash } from "@/lib/external-intelligence/config/hashing";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";

export type LoadedSourceRegistry = {
  registry: ReturnType<typeof SourceRegistryFileSchema.parse>;
  registry_content_hash: string;

  // Derived, non-semantic safety gates (does not mutate the registry object).
  automation_block_reasons_by_source_id: Record<string, string[]>;
};

export function loadSourceRegistryV1(): LoadedSourceRegistry {
  const raw = fs.readFileSync(SOURCE_REGISTRY_V1_PATH, "utf8");
  const json = JSON.parse(raw) as unknown;
  const registry = SourceRegistryFileSchema.parse(json);

  // Uniqueness + fail-closed invariants.
  assertUniqueIds({ kind: "source_id", ids: registry.sources.map((s) => s.source_id) });

  for (const s of registry.sources) {
    if (s.enabled !== false) throw new Error(`Source must be disabled in fixtures: ${s.source_id}`);
    if (s.enabled_by_default !== false) throw new Error(`enabled_by_default must be false: ${s.source_id}`);
    if (s.implementation_status !== "unimplemented") throw new Error(`implementation_status must be unimplemented: ${s.source_id}`);
    if (!(s.lifecycle_status === "proposed" || s.lifecycle_status === "trial")) {
      throw new Error(`fixture lifecycle_status must be proposed/trial: ${s.source_id}`);
    }

    // No mutation here. Derive fail-closed automation gating reasons.
  }

  const automation_block_reasons_by_source_id: Record<string, string[]> = {};
  for (const s of registry.sources) {
    const reasons: string[] = [];

    if (s.automation_suitability === "prohibited") reasons.push("automation_suitability=prohibited");
    if (s.terms_review_status !== "approved") reasons.push(`terms_review_status=${s.terms_review_status}`);
    if (s.access_method.includes("paywalled") || s.paywalled) reasons.push("paywalled");
    if (s.licensing_required) reasons.push("licensing_required");

    // Fail-closed: unknown/unreviewed terms always block automation.
    automation_block_reasons_by_source_id[s.source_id] = reasons;
  }

  // Deterministic ordering.
  registry.sources.sort((a, b) => a.source_id.localeCompare(b.source_id));

  const registry_content_hash = createSourceRegistryContentHash(registry);

  return deepFreeze({ registry, registry_content_hash, automation_block_reasons_by_source_id });
}
