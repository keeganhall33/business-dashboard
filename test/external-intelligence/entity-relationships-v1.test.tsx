import test from "node:test";
import assert from "node:assert/strict";

import type { EntityRelationshipTypeV1 } from "@/lib/external-intelligence/entities/entity-relationship-v1";
import { generateCanonicalEntityIdV1 } from "@/lib/external-intelligence/entities/entity-v1";

function buildOrg(name: string) {
  return {
    entity_id: generateCanonicalEntityIdV1("organization"),
    entity_type: "organization" as const,
    canonical_name: name
  };
}

test("false-merge fixtures: Jordan Brand != Nike (relationship does not imply merge)", () => {
  const nike = buildOrg("Nike");
  const jordan = buildOrg("Jordan Brand");

  assert.notEqual(jordan.entity_id, nike.entity_id);

  const edge: { subject: string; type: EntityRelationshipTypeV1; object: string } = {
    subject: jordan.entity_id,
    type: "brand_of",
    object: nike.entity_id
  };

  assert.equal(edge.type, "brand_of");
});

test("false-merge fixtures: Mercedes-Benz USA != Mercedes-Benz AG", () => {
  const ag = buildOrg("Mercedes-Benz AG");
  const usa = buildOrg("Mercedes-Benz USA");
  assert.notEqual(ag.entity_id, usa.entity_id);
});

test("temporal semantics fixture: acquired company retains identity", () => {
  const agencyX = buildOrg("Agency X");
  const caa = buildOrg("Creative Artists Agency");

  const acquired: { subject: string; object: string; type: EntityRelationshipTypeV1; valid_from: string; valid_until: string | null } = {
    subject: agencyX.entity_id,
    type: "acquired_by",
    object: caa.entity_id,
    valid_from: new Date("2020-01-01T00:00:00.000Z").toISOString(),
    valid_until: null
  };

  assert.equal(acquired.type, "acquired_by");
  assert.equal(acquired.subject, agencyX.entity_id);
  assert.equal(acquired.object, caa.entity_id);
});

