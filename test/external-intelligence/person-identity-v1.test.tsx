import test from "node:test";
import assert from "node:assert/strict";

import { decideResolutionOutcomeV1 } from "@/lib/external-intelligence/entities/entity-resolution-policy-v1";
import { generateCanonicalEntityIdV1 } from "@/lib/external-intelligence/entities/entity-v1";

test("person identity: entity_id is opaque and not derived from employer/title", () => {
  const id1 = generateCanonicalEntityIdV1("person");
  const id2 = generateCanonicalEntityIdV1("person");
  assert.ok(id1.startsWith("person:"));
  assert.ok(id2.startsWith("person:"));
  assert.notEqual(id1, id2);
});

test("person resolution: name-only never AUTO_RESOLVE", () => {
  const out = decideResolutionOutcomeV1({
    evidence: [
      {
        evidence_class: "alias_only",
        strength: "weak",
        description: "same full name string observed"
      }
    ],
    has_conflicting_strong_identifiers: false
  });

  assert.equal(out.outcome, "SUGGESTED_MATCH");
});

test("person resolution: verified external identifier may AUTO_RESOLVE", () => {
  const out = decideResolutionOutcomeV1({
    evidence: [
      {
        evidence_class: "verified_external_identifier",
        strength: "strong",
        description: "verified crm contact id"
      }
    ],
    has_conflicting_strong_identifiers: false
  });

  assert.equal(out.outcome, "AUTO_RESOLVE");
});

