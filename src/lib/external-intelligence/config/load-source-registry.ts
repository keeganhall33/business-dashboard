import fs from "node:fs";

import { SourceRegistryFileSchema, assertUniqueIds } from "@/lib/external-intelligence/config/contracts";
import { SOURCE_REGISTRY_V1_PATH } from "@/lib/external-intelligence/config/paths";

export type LoadedSourceRegistry = {
  registry: ReturnType<typeof SourceRegistryFileSchema.parse>;
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

    // Terms review must fail-closed at execution time.
    // A2 does not mutate config, but Phase B+ must treat non-approved terms_review_status as blocking automation,
    // regardless of the declared automation_suitability.
  }

  // Deterministic ordering.
  registry.sources.sort((a, b) => a.source_id.localeCompare(b.source_id));

  return { registry };
}
