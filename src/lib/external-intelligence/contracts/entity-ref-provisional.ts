import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";

export function buildProvisionalEntityRefV1(input: {
  entity_id: string;
  entity_type: string;
  canonical_name: string;
}): EntityRef {
  return {
    entity_id: input.entity_id,
    entity_type: input.entity_type,
    canonical_name: input.canonical_name,

    aliases: [],
    source_specific_ids: {},

    resolution_status: "unresolved",
    resolution_confidence: {
      level: "unknown",
      bounded_score: null,
      reasons: ["provisional_entity_ref"],
      blockers: [],
      supporting_reference_ids: [],
      contradicting_reference_ids: [],
      missing_evidence_ids: []
    },

    ambiguity_flags: [],
    possible_entity_ids: [],

    alias_provenance: [],
    entity_resolution_version: "entity_resolution_v1",

    last_verified_at: null,
    valid_from: null,
    valid_until: null
  };
}
