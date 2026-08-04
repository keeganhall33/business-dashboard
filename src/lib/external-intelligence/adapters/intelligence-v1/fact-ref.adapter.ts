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

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateCanonicalJsonValue(value: unknown, seen: WeakSet<object>): value is JsonValue {
  if (value === null) return true;
  if (value === undefined) return false;

  const t = typeof value;
  if (t === "string" || t === "boolean") return true;
  if (t === "number") return Number.isFinite(value);
  if (t === "bigint" || t === "symbol" || t === "function") return false;

  if (Array.isArray(value)) {
    // Preserve array order; do not normalize here.
    for (const v of value) {
      if (!validateCanonicalJsonValue(v, seen)) return false;
    }
    return true;
  }

  if (value instanceof Date) return false;
  if (!isPlainObject(value)) return false;

  if (seen.has(value)) return false;
  seen.add(value);

  for (const [k, v] of Object.entries(value)) {
    if (typeof k !== "string") return false;
    if (!validateCanonicalJsonValue(v, seen)) return false;
  }
  return true;
}

function assertCanonicalJsonDimensions(dimensions: unknown): asserts dimensions is Record<string, JsonValue> {
  if (!isPlainObject(dimensions)) throw new Error("FactRef.dimensions must be a plain object");
  const seen = new WeakSet<object>();
  if (!validateCanonicalJsonValue(dimensions, seen)) {
    throw new Error("FactRef.dimensions contains non-canonical JSON values");
  }
}

export function createInternalFactVersionRef(input: { fact: FactRef }): VersionedInternalFactRef {
  const f = input.fact;

  if (!f.metric_id) throw new Error("FactRef.metric_id is required");
  if (!f.metric_definition_version) throw new Error("FactRef.metric_definition_version is required");

  assertCanonicalJsonDimensions(f.dimensions);

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
