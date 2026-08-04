import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import type { ObjectType } from "@/lib/external-intelligence/contracts/enums";

export type VersionRef = {
  object_type: ObjectType;
  object_id: string;

  /**
   * Optional human-readable sequence identifier.
   * Must never replace content_hash as the immutable version identity.
   */
  version_id: string | null;

  /**
   * Canonical immutable version identity.
   * Deterministic SHA-256 hex of canonical JSON bytes.
   */
  content_hash: string;

  schema_version: string;
  policy_version: string;
  created_at: string; // ISO-8601
};

export function computeContentHash(value: unknown): string {
  // Reuse canonical JSON behavior from fusion-v1.
  return canonicalJsonSha256Hex(value);
}

export function assertHasImmutableVersionIdentity(ref: VersionRef): void {
  if (!ref.content_hash) throw new Error("VersionRef.content_hash is required");
  // ID-only references are invalid for reproducibility.
  if (!ref.object_id) throw new Error("VersionRef.object_id is required");
}
