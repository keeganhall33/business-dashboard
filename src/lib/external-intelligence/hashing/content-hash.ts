import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";

/**
 * Canonical hashing invariants (authoritative)
 *
 * Applies to:
 * - VersionRef
 * - PolicyRef
 * - Source Registry + Source Sets configuration hashes
 * - EvidenceReference / Claim / ExternalSignal fingerprints
 * - future persisted external-intelligence objects
 *
 * Requirements:
 * - serializer: src/lib/fusion-v1/canonical-json.ts
 * - encoding: UTF-8
 * - digest: SHA-256 hex
 * - object keys sorted recursively by canonical-json
 * - ordered arrays preserve order
 * - set-like arrays MUST be normalized deterministically by the caller/projection (sorted unique)
 * - excluded metadata MUST be explicitly listed per object type
 * - never hash an arbitrary whole object when only a defined semantic projection is intended
 */

export const CANONICAL_HASHING = {
  serializer: "src/lib/fusion-v1/canonical-json.ts",
  encoding: "utf-8",
  digest: "sha256-hex"
} as const;

// Policy hashing (semantic projection)
// Non-semantic metadata excluded from policy content identity.
export const POLICY_HASH_EXCLUDED_FIELDS = ["changed_at", "approved_by", "change_reason", "content_hash"] as const;

// Known set-like arrays in policy fixtures (normalize sorted unique before hashing).
export const POLICY_SET_LIKE_ARRAY_FIELDS = ["required_axes", "dispositions"] as const;

/**
 * Phase A1: Deterministic content hashing.
 * Reuses fusion-v1 canonical JSON and SHA-256 behavior.
 */
export function sha256CanonicalJson(value: unknown): string {
  return canonicalJsonSha256Hex(value);
}

export function createVersionRefContentHash(semanticObject: unknown): string {
  return sha256CanonicalJson(semanticObject);
}

export function createPolicyRefContentHash(semanticPolicyObject: unknown): string {
  if (!semanticPolicyObject || typeof semanticPolicyObject !== "object") {
    return sha256CanonicalJson(semanticPolicyObject);
  }

  // Deterministic hashing by construction: exclude non-semantic metadata that must not affect identity.
  const obj = semanticPolicyObject as Record<string, unknown>;
  const { changed_at, approved_by, change_reason, content_hash, ...rest } = obj;
  void changed_at;
  void approved_by;
  void change_reason;
  void content_hash;

  // Normalize set-like arrays in known policy shapes.
  const normalizeSet = (v: unknown) => {
    if (!Array.isArray(v)) return v;
    return [...new Set(v.map((x) => String(x)))].sort((a, b) => a.localeCompare(b));
  };

  const normalized: Record<string, unknown> = { ...rest };

  // Normalize common set-like arrays in known policy shapes.
  if ("required_axes" in normalized) normalized.required_axes = normalizeSet(normalized.required_axes);
  if ("dispositions" in normalized) normalized.dispositions = normalizeSet(normalized.dispositions);
  if (typeof normalized.rules === "object" && normalized.rules) {
    const rules = normalized.rules as Record<string, unknown>;
    if ("required_axes" in rules) {
      normalized.rules = { ...rules, required_axes: normalizeSet(rules.required_axes) };
    }
    if ("dispositions" in rules) {
      normalized.rules = { ...rules, dispositions: normalizeSet(rules.dispositions) };
    }
  }

  return sha256CanonicalJson(normalized);
}
