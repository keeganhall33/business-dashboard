/**
 * EvidenceReference replay equivalence (V1)
 *
 * Problem:
 * - EvidenceReference semantic/version fingerprint intentionally EXCLUDES retrieval occurrence metadata.
 * - The persistence RPC enforces idempotent replay by requiring byte-identical payload_json.
 * - Re-collecting the same semantic evidence inevitably changes timestamps (and may change rss_position),
 *   producing false integrity_conflict.
 *
 * Contract (V1): when the same (evidence_reference_id, fingerprint content_hash) already exists,
 * the replay may differ ONLY in explicitly allowlisted observation metadata paths.
 *
 * IMPORTANT:
 * - This does NOT update the immutable stored payload_json; it only defines equality for replay.
 * - Non-allowlisted drift must still fail closed as integrity_conflict.
 */

export const EVIDENCE_REPLAY_VOLATILE_PATHS_V1 = Object.freeze([
  "retrieved_at",
  "provenance_metadata.collected_at",
  "provenance_metadata.rss_position"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize an EvidenceReference payload for idempotent replay comparison.
 *
 * Removes only the allowlisted volatile observation fields.
 */
export function normalizeEvidencePayloadForReplayEquivalenceV1(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  // Top-level volatile field.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { retrieved_at, provenance_metadata, ...rest } = payload;

  // Nested provenance volatility.
  let normalizedProvenance: Record<string, unknown> | undefined;
  if (isRecord(provenance_metadata)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { collected_at, rss_position, ...provRest } = provenance_metadata;
    normalizedProvenance = provRest;
  } else if (provenance_metadata !== undefined) {
    // Preserve non-object provenance if someone violates the contract; do not silently coerce.
    // (The schema should prevent this in normal flows.)
    normalizedProvenance = { provenance_metadata };
  }

  return normalizedProvenance === undefined ? rest : { ...rest, provenance_metadata: normalizedProvenance };
}

