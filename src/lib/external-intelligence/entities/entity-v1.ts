import crypto from "node:crypto";

export type CanonicalEntityTypeV1 = "organization" | "person";
export type CanonicalEntityResolutionStatusV1 = "active" | "retired" | "merged" | "superseded";

export type CanonicalEntityV1 = {
  entity_id: string;
  entity_type: CanonicalEntityTypeV1;
  canonical_name: string;
  resolution_status: CanonicalEntityResolutionStatusV1;
  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
};

/**
 * Canonical Entity V1 ID scheme
 *
 * Constraints:
 * - MUST be opaque and stable.
 * - MUST NOT derive from canonical_name.
 * - MUST be safe to generate offline.
 *
 * Scheme:
 * - organization: `org:<uuid>`
 * - person: `person:<uuid>`
 */
export function generateCanonicalEntityIdV1(type: CanonicalEntityTypeV1): string {
  const uuid = crypto.randomUUID();
  return type === "organization" ? `org:${uuid}` : `person:${uuid}`;
}
