import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";

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
  return sha256CanonicalJson(semanticPolicyObject);
}
