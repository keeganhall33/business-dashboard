import crypto from "node:crypto";

import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
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
 * V2 deterministic claim id:
 * evidence_reference_id|predicate|subject.entity_id|object.entity_id|identity_qualifiers_fingerprint
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
