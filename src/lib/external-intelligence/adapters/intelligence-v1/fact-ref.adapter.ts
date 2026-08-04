import type { FactRef } from "@/lib/intelligence-v1/contracts";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { createVersionRefContentHash } from "@/lib/external-intelligence/hashing/content-hash";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { INTELLIGENCE_V1_ADAPTER_POLICY_REF } from "@/lib/external-intelligence/adapters/intelligence-v1/adapter-policy";

export type VersionedInternalFactRef = {
  object: FactRef;
  version_ref: VersionRef;
  adapter_policy: typeof INTELLIGENCE_V1_ADAPTER_POLICY_REF;
};

export function createInternalFactVersionRef(input: { fact: FactRef }): VersionedInternalFactRef {
  const f = input.fact;

  if (!f.metric_id) throw new Error("FactRef.metric_id is required");
  if (!f.metric_definition_version) throw new Error("FactRef.metric_definition_version is required");

  // Deterministic semantic projection.
  // Exclude non-semantic retrieval timestamps.
  const semantic = {
    metric_id: f.metric_id,
    metric_definition_version: f.metric_definition_version,
    value: f.value,
    unit: f.unit,
    business_date: f.business_date ?? null,
    window: f.window,
    dimensions: f.dimensions,
    provenance: {
      source_type: f.provenance.source_type ?? null,
      source_system: f.provenance.source_system ?? "unknown",
      source_run_id: f.provenance.source_run_id ?? null,
      snapshot_id: f.provenance.snapshot_id ?? null,
      source_as_of: f.provenance.source_as_of ?? null
    },
    data_quality: f.data_quality
  };

  const content_hash = createVersionRefContentHash(semantic);

  const version_ref: VersionRef = {
    object_type: "internal_fact",
    object_id: f.metric_id,
    version_id: null,
    content_hash,
    schema_version: "internal_fact_v1",
    policy_version: INTELLIGENCE_V1_ADAPTER_POLICY_REF.semantic_version,
    created_at: new Date(0).toISOString()
  };

  return deepFreeze({ object: f, version_ref, adapter_policy: INTELLIGENCE_V1_ADAPTER_POLICY_REF });
}
