import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import { OBJECT_TYPE_VALUES, type ObjectType } from "@/lib/external-intelligence/contracts/enums";
import { z } from "zod";

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

export const VersionRefSchema = z
  .object({
    object_type: z.enum(OBJECT_TYPE_VALUES) as z.ZodType<ObjectType>,
    object_id: z.string().min(1),
    version_id: z.string().min(1).nullable(),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    schema_version: z.string().min(1),
    policy_version: z.string().min(1),
    created_at: z.string().datetime({ offset: true })
  })
  .strict();

export function computeContentHash(value: unknown): string {
  // Reuse canonical JSON behavior from fusion-v1.
  return canonicalJsonSha256Hex(value);
}

export function assertHasImmutableVersionIdentity(ref: VersionRef): void {
  if (!ref.content_hash) throw new Error("VersionRef.content_hash is required");
  // ID-only references are invalid for reproducibility.
  if (!ref.object_id) throw new Error("VersionRef.object_id is required");
}
