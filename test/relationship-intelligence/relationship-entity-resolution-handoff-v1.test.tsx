import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRelationshipEntityHandoffV1,
  type RelationshipCanonicalEntityV1,
  type RelationshipEntityCandidateV1,
  type RelationshipEntityEvidenceFieldV1,
  type RelationshipEntityTruthStateV1,
  type RelationshipExternalIdentityV1
} from "../../src/lib/relationship-intelligence/relationship-entity-resolution-handoff-v1";

const NOW = "2026-09-18T09:00:00.000Z";

function field<T>(
  value: T | null,
  state: RelationshipEntityTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:field"]
): RelationshipEntityEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function identity(namespace = "provider-person-id", value = "person-123"): RelationshipExternalIdentityV1 {
  return { namespace, value };
}

function candidate(overrides: Partial<RelationshipEntityCandidateV1> = {}): RelationshipEntityCandidateV1 {
  return {
    candidateId: "candidate-1",
    sourceRef: "source:authorized-provider:record-1",
    observedAt: "2026-09-17T18:00:00.000Z",
    evidenceRefs: ["evidence:source"],
    entityType: "PERSON",
    displayName: field("Jordan Example", "KNOWN", ["evidence:name"]),
    externalIdentity: field(identity(), "KNOWN", ["evidence:identity"]),
    ...overrides
  };
}

function canonical(overrides: Partial<RelationshipCanonicalEntityV1> = {}): RelationshipCanonicalEntityV1 {
  return {
    canonicalEntityRef: "person:existing",
    entityType: "PERSON",
    externalIdentities: [identity()],
    ...overrides
  };
}

function resolve(
  candidates: readonly RelationshipEntityCandidateV1[],
  canonicalEntities: readonly RelationshipCanonicalEntityV1[] = []
) {
  return resolveRelationshipEntityHandoffV1({ candidates, canonicalEntities, now: NOW });
}

test("matches an existing entity only through an exact evidence-backed stable external identity", () => {
  const result = resolve([candidate()], [canonical()]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "MATCH_EXISTING");
  assert.equal(decision.canonicalEntityRef, "person:existing");
  assert.deepEqual(decision.reasonCodes, ["EXACT_EXTERNAL_IDENTITY_MATCH"]);
  assert.equal(decision.writeAuthority, "NONE");
  assert.equal(decision.requiresHumanReview, false);
});

test("honors an evidence-backed explicit canonical ref when entity type agrees", () => {
  const result = resolve(
    [
      candidate({
        explicitCanonicalEntityRef: field("person:existing", "KNOWN", ["evidence:canonical-ref"]),
        externalIdentity: null
      })
    ],
    [canonical({ externalIdentities: [] })]
  );

  assert.equal(result.decisions[0].disposition, "MATCH_EXISTING");
  assert.equal(result.decisions[0].canonicalEntityRef, "person:existing");
  assert.deepEqual(result.decisions[0].reasonCodes, ["EXPLICIT_CANONICAL_REF_MATCH"]);
});

test("never resolves by display name alone", () => {
  const result = resolve([
    candidate({
      displayName: field("Same Name", "KNOWN", ["evidence:name"]),
      externalIdentity: null
    })
  ]);

  assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["NAME_ONLY_RESOLUTION_FORBIDDEN"]);
  assert.equal(result.decisions[0].canonicalEntityRef, null);
});

test("can prepare a new candidate only when a stable evidence-backed identity is present", () => {
  const result = resolve([candidate()]);

  assert.equal(result.decisions[0].disposition, "CREATE_CANDIDATE");
  assert.deepEqual(result.decisions[0].reasonCodes, ["NEW_STABLE_IDENTITY_CANDIDATE"]);
  assert.deepEqual(result.decisions[0].externalIdentity, identity());
  assert.equal(result.crmMutationPerformed, false);
});

test("fails closed when an exact identity collides across person and organization types", () => {
  const result = resolve(
    [candidate()],
    [canonical({ canonicalEntityRef: "org:collision", entityType: "ORGANIZATION" })]
  );

  assert.equal(result.decisions[0].disposition, "BLOCKED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["EXTERNAL_IDENTITY_TYPE_CONFLICT"]);
});

test("requires review when one external identity maps to multiple canonical entities", () => {
  const result = resolve(
    [candidate()],
    [canonical({ canonicalEntityRef: "person:one" }), canonical({ canonicalEntityRef: "person:two" })]
  );

  assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["AMBIGUOUS_EXTERNAL_IDENTITY"]);
  assert.equal(result.decisions[0].canonicalEntityRef, null);
});

test("blocks contradictory explicit-ref and external-identity evidence", () => {
  const result = resolve(
    [
      candidate({
        explicitCanonicalEntityRef: field("person:one", "KNOWN", ["evidence:canonical-ref"])
      })
    ],
    [
      canonical({ canonicalEntityRef: "person:one", externalIdentities: [identity("provider-person-id", "different")] }),
      canonical({ canonicalEntityRef: "person:two" })
    ]
  );

  assert.equal(result.decisions[0].disposition, "BLOCKED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["EXPLICIT_REF_EXTERNAL_IDENTITY_CONFLICT"]);
});

test("routes inferred, partial, stale, conflicted, and unknown identity evidence to review", () => {
  const states: readonly RelationshipEntityTruthStateV1[] = ["INFERRED", "PARTIAL", "STALE", "CONFLICTED"];
  for (const state of states) {
    const result = resolve([
      candidate({
        candidateId: `candidate-${state}`,
        externalIdentity: field(identity(), state, [`evidence:${state}`])
      })
    ]);
    assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
    assert.deepEqual(result.decisions[0].reasonCodes, ["EVIDENCE_NOT_KNOWN"]);
  }

  const unknown = resolve([candidate({ externalIdentity: field(null, "UNKNOWN", ["evidence:unknown"]) })]);
  assert.equal(unknown.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.deepEqual(unknown.decisions[0].reasonCodes, ["NAME_ONLY_RESOLUTION_FORBIDDEN"]);
});

test("does not use stale observations for automatic matching or candidate creation", () => {
  const result = resolve([
    candidate({ observedAt: "2026-06-01T00:00:00.000Z" })
  ], [canonical()]);

  assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["OBSERVATION_STALE"]);
});

test("rejects contact coordinates as entity identity keys", () => {
  const email = resolve([
    candidate({ externalIdentity: field(identity("email", "person@example.com"), "KNOWN", ["evidence:email"]) })
  ]);
  const phone = resolve([
    candidate({ externalIdentity: field(identity("provider-id", "+1 206 555 0100"), "KNOWN", ["evidence:phone"]) })
  ]);

  assert.equal(email.decisions[0].disposition, "BLOCKED");
  assert.deepEqual(email.decisions[0].reasonCodes, ["UNSUPPORTED_CONTACT_IDENTITY"]);
  assert.equal(phone.decisions[0].disposition, "BLOCKED");
  assert.deepEqual(phone.decisions[0].reasonCodes, ["UNSUPPORTED_CONTACT_IDENTITY"]);
});

test("requires field-level evidence and source provenance rather than trusting bare values", () => {
  const noIdentityEvidence = resolve([
    candidate({ externalIdentity: field(identity(), "KNOWN", []) })
  ]);
  const noSourceEvidence = resolve([
    candidate({ evidenceRefs: [] })
  ]);

  assert.equal(noIdentityEvidence.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.deepEqual(noIdentityEvidence.decisions[0].reasonCodes, ["MISSING_FIELD_EVIDENCE"]);
  assert.equal(noSourceEvidence.decisions[0].disposition, "BLOCKED");
  assert.deepEqual(noSourceEvidence.decisions[0].reasonCodes, ["MISSING_SOURCE_PROVENANCE"]);
});

test("performs no CRM mutation, relationship creation, contact inference, or external action", () => {
  const first = resolve([candidate()], [canonical()]);
  const second = resolve([candidate()], [canonical()]);

  assert.deepEqual(first, second);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.relationshipEdgeCreated, false);
  assert.equal(first.contactInfoInferred, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].evidenceRefs), true);
});
