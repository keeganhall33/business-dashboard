import test from "node:test";
import assert from "node:assert/strict";

import { buildDeterministicClaimIdV2, computeIdentityQualifiersFingerprintV2 } from "@/lib/external-intelligence/contracts/claim-id-v2";
import { buildProvisionalEntityRefV1 } from "@/lib/external-intelligence/entities/provisional-entity-ref-v1";

test("claim id v2: identity qualifier ordering/whitespace does not change identity", () => {
  const subject = buildProvisionalEntityRefV1({
    canonical_name: "Premier Padel",
    entity_type: "organization",
    source_id: "sports_business.sportspro",
    evidence_reference_id: "ev_x"
  });
  const object = buildProvisionalEntityRefV1({
    canonical_name: "Ten Toes",
    entity_type: "organization",
    source_id: "sports_business.sportspro",
    evidence_reference_id: "ev_x"
  });

  const q1 = [{ key: "appointment_role", value_type: "string" as const, value: "lead   digital   marketing" }];
  const q2 = [{ key: "appointment_role", value_type: "string" as const, value: " lead digital marketing " }];

  const fp1 = computeIdentityQualifiersFingerprintV2({ qualifiers: q1, identity_keys: ["appointment_role"] });
  const fp2 = computeIdentityQualifiersFingerprintV2({ qualifiers: q2, identity_keys: ["appointment_role"] });
  assert.equal(fp1, fp2);

  const id1 = buildDeterministicClaimIdV2({
    evidence_reference_id: "ev_7acf1d21bdc0dff15d021946",
    predicate: "appointed",
    subject,
    object,
    qualifiers: q1,
    identity_keys: ["appointment_role"]
  });
  const id2 = buildDeterministicClaimIdV2({
    evidence_reference_id: "ev_7acf1d21bdc0dff15d021946",
    predicate: "appointed",
    subject,
    object,
    qualifiers: q2,
    identity_keys: ["appointment_role"]
  });

  assert.equal(id1, id2);
});

test("claim id v2: identity-bearing role change changes claim identity", () => {
  const subject = buildProvisionalEntityRefV1({
    canonical_name: "MI London",
    entity_type: "organization",
    source_id: "sports_business.sportspro",
    evidence_reference_id: "ev_y"
  });
  const object = buildProvisionalEntityRefV1({
    canonical_name: "Ten Toes",
    entity_type: "organization",
    source_id: "sports_business.sportspro",
    evidence_reference_id: "ev_y"
  });

  const a = buildDeterministicClaimIdV2({
    evidence_reference_id: "ev_f1fa565a9fdf8831ec0e7d7b",
    predicate: "appointed",
    subject,
    object,
    qualifiers: [{ key: "appointment_role", value_type: "string", value: "content agency" }],
    identity_keys: ["appointment_role"]
  });

  const b = buildDeterministicClaimIdV2({
    evidence_reference_id: "ev_f1fa565a9fdf8831ec0e7d7b",
    predicate: "appointed",
    subject,
    object,
    qualifiers: [{ key: "appointment_role", value_type: "string", value: "lead digital marketing" }],
    identity_keys: ["appointment_role"]
  });

  assert.notEqual(a, b);
});
