import crypto from "node:crypto";

import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { ClaimObjectLiteral } from "@/lib/external-intelligence/contracts/claim";
import {
  canonicalizeClaimQualifiersV2,
  type ClaimQualifierV2
} from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function computeIdentityQualifiersFingerprintV2(input: {
  qualifiers: ClaimQualifierV2[];
  identity_keys: string[];
}): string {
  const canonical = canonicalizeClaimQualifiersV2(input.qualifiers);
  const identitySet = new Set(input.identity_keys);
  const identity = canonical.filter((q) => identitySet.has(q.key));
  return sha256Hex(JSON.stringify(identity));
}

/**
 * V2 deterministic claim id (entity-object only):
 * evidence_reference_id|predicate|subject.entity_id|object.entity_id|identity_qualifiers_fingerprint
 *
 * NOTE: This function intentionally remains entity-object-only for backward compatibility.
 */
export function buildDeterministicClaimIdV2(input: {
  evidence_reference_id: string;
  predicate: string;
  subject: EntityRef;
  object: EntityRef;
  qualifiers: ClaimQualifierV2[];
  identity_keys: string[];
}): string {
  const identityFp = computeIdentityQualifiersFingerprintV2({
    qualifiers: input.qualifiers,
    identity_keys: input.identity_keys
  });
  const key = `${input.evidence_reference_id}|${input.predicate}|${input.subject.entity_id}|${input.object.entity_id}|${identityFp}`;
  return `cl_${sha256Hex(key).slice(0, 24)}`;
}

export type ClaimObjectIdentityV2 =
  | { kind: "entity"; entity_id: string }
  | {
      kind: "literal";
      value_type: ClaimObjectLiteral["value_type"];
      value: ClaimObjectLiteral["value"];
      unit: string | null;
      language: string | null;
    };

function canonicalizeLiteralIdentity(input: {
  value_type: ClaimObjectLiteral["value_type"];
  value: ClaimObjectLiteral["value"];
  unit: string | null;
  language: string | null;
}) {
  // No coercion. Preserve type distinctions.
  // Unit/language participate in identity only when provided.
  return {
    kind: "literal" as const,
    value_type: input.value_type,
    value: input.value,
    unit: input.unit ?? null,
    language: input.language ?? null
  };
}

/**
 * V2 deterministic claim id (entity OR literal object).
 *
 * Back-compat requirement:
 * - Does NOT change existing entity-object id generation.
 * - Provides a deterministic identity path for literal-object claims.
 */
export function buildDeterministicClaimIdV2Object(input: {
  evidence_reference_id: string;
  predicate: string;
  subject: EntityRef;
  object: ClaimObjectIdentityV2;
  qualifiers: ClaimQualifierV2[];
  identity_keys: string[];
}): string {
  if (input.object.kind === "entity") {
    return buildDeterministicClaimIdV2({
      evidence_reference_id: input.evidence_reference_id,
      predicate: input.predicate,
      subject: input.subject,
      object: { entity_id: input.object.entity_id } as EntityRef,
      qualifiers: input.qualifiers,
      identity_keys: input.identity_keys
    });
  }

  const identityFp = computeIdentityQualifiersFingerprintV2({
    qualifiers: input.qualifiers,
    identity_keys: input.identity_keys
  });

  const lit = canonicalizeLiteralIdentity({
    value_type: input.object.value_type,
    value: input.object.value,
    unit: input.object.unit,
    language: input.object.language
  });
  const objectFp = sha256Hex(JSON.stringify(lit));
  const key = `${input.evidence_reference_id}|${input.predicate}|${input.subject.entity_id}|literal|${objectFp}|${identityFp}`;
  return `cl_${sha256Hex(key).slice(0, 24)}`;
}
