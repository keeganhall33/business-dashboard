import assert from "node:assert/strict";
import test from "node:test";

import {
  projectRelationshipGraphPopulationV1,
  type RelationshipGraphEvidenceV1
} from "@/lib/relationships-crm/relationship-graph-population-v1";

const NOW = "2026-09-19T07:00:00.000Z";

function evidence(overrides: Partial<RelationshipGraphEvidenceV1> = {}): RelationshipGraphEvidenceV1 {
  return {
    sourceEntityType: "PERSON",
    sourceCanonicalId: "person-michelle",
    targetEntityType: "COMPANY",
    targetCanonicalId: "company-public-school",
    relationshipKind: "EMPLOYED_BY",
    resolution: "RESOLVED",
    evidenceState: "KNOWN",
    observedAt: "2026-09-18T18:00:00.000Z",
    freshThrough: "2026-10-18T18:00:00.000Z",
    provenanceRef: "crm:relationship:michelle-public-school",
    evidenceRefs: ["evidence:crm:relationship:1"],
    authority: "EVIDENCE_ONLY",
    ...overrides
  };
}

test("proposes only an exact evidence-supported directed edge for internal review", () => {
  const result = projectRelationshipGraphPopulationV1({ now: NOW, evidence: [evidence()] });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.withheld.length, 0);
  assert.equal(result.verificationRequired, false);
  assert.equal(result.externalWritesEnabled, false);
  assert.deepEqual(result.proposals[0], {
    edgeKey: "PERSON:person-michelle:EMPLOYED_BY:COMPANY:company-public-school",
    sourceEntityType: "PERSON",
    sourceCanonicalId: "person-michelle",
    targetEntityType: "COMPANY",
    targetCanonicalId: "company-public-school",
    relationshipKind: "EMPLOYED_BY",
    observedAt: "2026-09-18T18:00:00.000Z",
    freshThrough: "2026-10-18T18:00:00.000Z",
    provenanceRefs: ["crm:relationship:michelle-public-school"],
    evidenceRefs: ["evidence:crm:relationship:1"],
    reviewState: "READY_FOR_INTERNAL_REVIEW",
    externalWritesEnabled: false,
    inferredReverseEdge: false,
    notEstablished: [
      "WARMTH",
      "DECISION_AUTHORITY",
      "SPONSORSHIP",
      "ENDORSEMENT",
      "CONTACT_INFO",
      "INTEREST",
      "OPPORTUNITY_CERTAINTY",
      "CONFIDENCE",
      "MONETARY_VALUE",
      "TIMING"
    ]
  });
});

test("never infers a reverse relationship", () => {
  const result = projectRelationshipGraphPopulationV1({ now: NOW, evidence: [evidence()] });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].inferredReverseEdge, false);
  assert.equal(
    result.proposals.some((proposal) =>
      proposal.sourceCanonicalId === "company-public-school" && proposal.targetCanonicalId === "person-michelle"),
    false
  );
});

test("ambiguous unavailable or missing canonical identity fails closed", () => {
  const result = projectRelationshipGraphPopulationV1({
    now: NOW,
    evidence: [
      evidence({ resolution: "AMBIGUOUS" }),
      evidence({ sourceCanonicalId: "person-unavailable", resolution: "UNAVAILABLE" }),
      evidence({ sourceCanonicalId: null })
    ]
  });

  assert.equal(result.proposals.length, 0);
  assert.equal(result.verificationRequired, true);
  assert.deepEqual(
    new Set(result.withheld.map((item) => item.reason)),
    new Set(["AMBIGUOUS_IDENTITY", "IDENTITY_UNAVAILABLE", "CANONICAL_ID_MISSING"])
  );
});

test("partial stale conflicted future-dated and expired evidence fails closed", () => {
  const result = projectRelationshipGraphPopulationV1({
    now: NOW,
    evidence: [
      evidence({ evidenceState: "PARTIAL" }),
      evidence({ sourceCanonicalId: "person-stale", evidenceState: "STALE" }),
      evidence({ sourceCanonicalId: "person-conflicted", evidenceState: "CONFLICTED" }),
      evidence({
        sourceCanonicalId: "person-future",
        observedAt: "2026-09-20T07:00:00.000Z",
        freshThrough: "2026-10-20T07:00:00.000Z"
      }),
      evidence({
        sourceCanonicalId: "person-expired",
        observedAt: "2026-08-01T07:00:00.000Z",
        freshThrough: "2026-09-18T07:00:00.000Z"
      })
    ]
  });

  assert.equal(result.proposals.length, 0);
  assert.deepEqual(
    new Set(result.withheld.map((item) => item.reason)),
    new Set(["EVIDENCE_PARTIAL", "EVIDENCE_STALE", "EVIDENCE_CONFLICTED", "FUTURE_DATED", "FRESHNESS_EXPIRED"])
  );
});

test("self edges missing evidence and unsupported endpoint semantics are withheld", () => {
  const result = projectRelationshipGraphPopulationV1({
    now: NOW,
    evidence: [
      evidence({
        targetEntityType: "PERSON",
        targetCanonicalId: "person-michelle",
        relationshipKind: "COMMUNICATED_WITH"
      }),
      evidence({ sourceCanonicalId: "person-no-evidence", evidenceRefs: [] }),
      evidence({
        sourceEntityType: "COMPANY",
        sourceCanonicalId: "company-public-school",
        targetEntityType: "PERSON",
        targetCanonicalId: "person-michelle",
        relationshipKind: "EMPLOYED_BY"
      })
    ]
  });

  assert.equal(result.proposals.length, 0);
  assert.deepEqual(
    new Set(result.withheld.map((item) => item.reason)),
    new Set(["SELF_EDGE", "EVIDENCE_MISSING", "UNSUPPORTED_ENDPOINTS"])
  );
});

test("exact duplicate observations merge deterministically without widening semantics", () => {
  const result = projectRelationshipGraphPopulationV1({
    now: NOW,
    evidence: [
      evidence({ evidenceRefs: ["evidence:b"], provenanceRef: "crm:b" }),
      evidence({
        observedAt: "2026-09-19T06:00:00.000Z",
        freshThrough: "2026-09-30T00:00:00.000Z",
        evidenceRefs: ["evidence:a"],
        provenanceRef: "crm:a"
      })
    ]
  });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].observedAt, "2026-09-19T06:00:00.000Z");
  assert.equal(result.proposals[0].freshThrough, "2026-09-30T00:00:00.000Z");
  assert.deepEqual(result.proposals[0].evidenceRefs, ["evidence:a", "evidence:b"]);
  assert.deepEqual(result.proposals[0].provenanceRefs, ["crm:a", "crm:b"]);
});

test("the boundary rejects authority widening and malformed freshness instead of guessing", () => {
  assert.throws(
    () => projectRelationshipGraphPopulationV1({
      now: NOW,
      evidence: [{ ...evidence(), authority: "EXTERNAL_WRITE" as "EVIDENCE_ONLY" }]
    }),
    /RELATIONSHIP_GRAPH_AUTHORITY_INVALID/
  );

  assert.throws(
    () => projectRelationshipGraphPopulationV1({
      now: NOW,
      evidence: [evidence({
        observedAt: "2026-09-18T18:00:00.000Z",
        freshThrough: "2026-09-17T18:00:00.000Z"
      })]
    }),
    /RELATIONSHIP_GRAPH_FRESHNESS_RANGE_INVALID/
  );
});

test("communication and introductions require exact person-to-person evidence", () => {
  const personToPerson = projectRelationshipGraphPopulationV1({
    now: NOW,
    evidence: [evidence({
      targetEntityType: "PERSON",
      targetCanonicalId: "person-andi",
      relationshipKind: "INTRODUCED_TO",
      provenanceRef: "email:introduction:1",
      evidenceRefs: ["evidence:email:message:1"]
    })]
  });
  assert.equal(personToPerson.proposals.length, 1);

  const companyToPerson = projectRelationshipGraphPopulationV1({
    now: NOW,
    evidence: [evidence({
      sourceEntityType: "COMPANY",
      sourceCanonicalId: "company-public-school",
      targetEntityType: "PERSON",
      targetCanonicalId: "person-andi",
      relationshipKind: "INTRODUCED_TO"
    })]
  });
  assert.equal(companyToPerson.proposals.length, 0);
  assert.equal(companyToPerson.withheld[0].reason, "UNSUPPORTED_ENDPOINTS");
});
