import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";

import crypto from "node:crypto";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export type ProvisionalEntityTypeV1 = "organization";

/**
 * Phase B? (Generalized Claim V1): deterministic provisional EntityRef.
 *
 * Constraints:
 * - MUST be deterministic and replayable from persisted evidence text.
 * - MUST produce an entity_id starting with `provisional:`.
 * - MUST remain conservative: unresolved/provisional, not "known".
 */
export function buildProvisionalEntityRefV1(input: {
  canonical_name: string;
  entity_type: ProvisionalEntityTypeV1;
  source_id: string;
  evidence_reference_id: string;
}): EntityRef {
  const canonical_name = normalizeWhitespace(input.canonical_name);
  if (!canonical_name) throw new Error("precondition_failed:empty_canonical_name");

  // Deterministic identity. Avoid fragile slugs; hash is stable across punctuation and casing.
  // Include entity_type to prevent accidental cross-type collisions.
  const identity = {
    v: "provisional_entity_ref_v1",
    entity_type: input.entity_type,
    canonical_name
  };
  const hash = sha256Hex(JSON.stringify(identity));
  const entity_id = `provisional:${input.entity_type}:${hash.slice(0, 24)}`;

  return {
    entity_id,
    entity_type: input.entity_type,
    canonical_name,

    aliases: [],
    source_specific_ids: {},

    resolution_status: "unresolved",
    resolution_confidence: {
      level: "possible",
      bounded_score: null,
      reasons: ["provisional_from_persisted_text"],
      blockers: [],
      supporting_reference_ids: [],
      contradicting_reference_ids: [],
      missing_evidence_ids: []
    },

    ambiguity_flags: [],
    possible_entity_ids: [],

    alias_provenance: [{ alias: canonical_name, source_id: input.source_id, evidence_reference_id: input.evidence_reference_id }],
    entity_resolution_version: "entity_resolution_v1.provisional_only",

    last_verified_at: null,
    valid_from: null,
    valid_until: null
  };
}
