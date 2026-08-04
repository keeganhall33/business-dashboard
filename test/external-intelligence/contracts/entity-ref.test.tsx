import test from "node:test";
import assert from "node:assert/strict";

import { EntityRefSchema } from "@/lib/external-intelligence/contracts/entity-ref";

test("EntityRef preserves unresolved/ambiguous state", () => {
  const ref = EntityRefSchema.parse({
    entity_id: "provisional:person:john_smith",
    entity_type: "person",
    canonical_name: "John Smith",
    aliases: ["J. Smith"],
    source_specific_ids: {},
    resolution_status: "unresolved",
    resolution_confidence: {
      level: "unknown",
      bounded_score: null,
      reasons: ["not resolved"],
      blockers: ["ambiguous"],
      supporting_reference_ids: [],
      contradicting_reference_ids: [],
      missing_evidence_ids: []
    },
    ambiguity_flags: ["name_collision"],
    possible_entity_ids: ["person:john_smith_1", "person:john_smith_2"],
    alias_provenance: [],
    entity_resolution_version: "entity_resolution_v1.0",
    last_verified_at: null,
    valid_from: null,
    valid_until: null
  });

  assert.equal(ref.resolution_status, "unresolved");
});
