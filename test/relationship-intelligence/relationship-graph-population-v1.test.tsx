import assert from "node:assert/strict";
import test from "node:test";

import {
  compileRelationshipGraphPopulationV1,
  type CompileRelationshipGraphPopulationV1Input
} from "../../src/lib/relationship-intelligence/relationship-graph-population-v1";
import {
  qualifySponsorMapCandidatesV1,
  type SponsorMapCandidateV1,
  type SponsorMapEvidenceFieldV1,
  type SponsorMapTruthStateV1
} from "../../src/lib/relationship-intelligence/sponsor-map-qualification-v1";
import {
  reconcileDecisionMakerRoleFreshnessV1,
  type DecisionMakerRoleObservationV1,
  type RoleEvidenceFieldV1,
  type RoleFreshnessTruthStateV1
} from "../../src/lib/relationship-intelligence/decision-maker-role-freshness-v1";

const NOW = "2026-09-18T12:00:00.000Z";

function sponsorField<T>(
  value: T | null,
  state: SponsorMapTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:sponsor-field"]
): SponsorMapEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function sponsorCandidate(overrides: Partial<SponsorMapCandidateV1> = {}): SponsorMapCandidateV1 {
  return {
    candidateId: "candidate:brand-buyer",
    sourceRef: "source:official-brand-bio",
    observedAt: "2026-09-18T10:00:00.000Z",
    evidenceRefs: ["evidence:sponsor-primary"],
    canonicalOrganizationRef: "org:brand",
    canonicalPersonRef: "person:buyer",
    duplicateKey: "org:brand:person:buyer",
    ecosystemRole: sponsorField("SPONSOR_SIDE"),
    decisionFunction: sponsorField("SPORTS_MARKETING"),
    authorityClass: sponsorField("DECISION_MAKER"),
    accessPath: sponsorField("WARM"),
    contactRoute: sponsorField("PUBLIC_PROFESSIONAL"),
    planningWindow: sponsorField("2027 activation planning is underway."),
    eventOrSeasonDate: sponsorField("2027 season"),
    ...overrides
  };
}

function roleField<T>(
  value: T | null,
  state: RoleFreshnessTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:role-field"]
): RoleEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function roleObservation(overrides: Partial<DecisionMakerRoleObservationV1> = {}): DecisionMakerRoleObservationV1 {
  return {
    observationId: "role:buyer:current",
    canonicalPersonRef: "person:buyer",
    canonicalOrganizationRef: "org:brand",
    observedAt: "2026-09-18T09:00:00.000Z",
    sourceRef: "source:official-brand-leadership",
    evidenceRefs: ["evidence:role-primary"],
    truthState: "KNOWN",
    employmentState: roleField("CURRENT"),
    title: roleField("VP, Sports Marketing"),
    decisionFunction: roleField("SPORTS_MARKETING"),
    authorityClass: roleField("DECISION_MAKER"),
    ...overrides
  };
}

function compile(
  sponsorCandidates: readonly SponsorMapCandidateV1[],
  roleObservations: readonly DecisionMakerRoleObservationV1[] = [roleObservation()],
  overrides: Partial<CompileRelationshipGraphPopulationV1Input> = {}
) {
  const sponsorResult = qualifySponsorMapCandidatesV1({ candidates: sponsorCandidates, now: NOW });
  const roleResult = reconcileDecisionMakerRoleFreshnessV1({ observations: roleObservations, now: NOW });
  return compileRelationshipGraphPopulationV1({
    sponsorDecisions: sponsorResult.decisions,
    roleProjections: roleResult.roles,
    now: NOW,
    ...overrides
  });
}

test("proposes one evidence-backed current person-to-organization role without granting write or outreach authority", () => {
  const result = compile([sponsorCandidate()]);

  assert.equal(result.proposals.length, 1);
  assert.equal(result.decisions[0].disposition, "PROPOSE_EDGE");
  assert.deepEqual(result.decisions[0].reasonCodes, ["EDGE_READY"]);

  const proposal = result.proposals[0];
  assert.equal(proposal.relationshipType, "PERSON_ROLE_AT_ORGANIZATION");
  assert.equal(proposal.canonicalPersonRef, "person:buyer");
  assert.equal(proposal.canonicalOrganizationRef, "org:brand");
  assert.equal(proposal.title, "VP, Sports Marketing");
  assert.equal(proposal.decisionFunction, "SPORTS_MARKETING");
  assert.equal(proposal.authorityClass, "DECISION_MAKER");
  assert.equal(proposal.ecosystemRole, "SPONSOR_SIDE");
  assert.equal(proposal.accessPath.value, "WARM");
  assert.equal(proposal.warmPathEdgeCreated, false);
  assert.equal(proposal.sponsorshipRelationshipEdgeCreated, false);
  assert.equal(proposal.contactCoordinateIncluded, false);
  assert.equal(proposal.writeAuthority, "NONE");
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.relationshipGraphMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.ok(proposal.evidenceRefs.includes("evidence:sponsor-primary"));
  assert.ok(proposal.evidenceRefs.includes("evidence:role-primary"));
});

test("does not create a graph role from a sponsor candidate that lacks a canonical person", () => {
  const result = compile([sponsorCandidate({ canonicalPersonRef: null })]);

  assert.equal(result.proposals.length, 0);
  assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["MISSING_CANONICAL_PERSON"]);
});

test("skips upstream sponsor-map decisions that are not qualified for graph population", () => {
  const result = compile([
    sponsorCandidate({ authorityClass: sponsorField("UNKNOWN") })
  ]);

  assert.equal(result.proposals.length, 0);
  assert.equal(result.decisions[0].disposition, "SKIPPED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["SPONSOR_MAP_NOT_QUALIFIED"]);
});

test("requires the independent current-role freshness projection before proposing a decision-maker edge", () => {
  const result = compile([sponsorCandidate()], []);

  assert.equal(result.proposals.length, 0);
  assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.deepEqual(result.decisions[0].reasonCodes, ["MISSING_ROLE_FRESHNESS_PROJECTION"]);
});

test("fails closed when current-role evidence points to a different organization", () => {
  const result = compile([
    sponsorCandidate()
  ], [
    roleObservation({ canonicalOrganizationRef: "org:different-brand" })
  ]);

  assert.equal(result.proposals.length, 0);
  assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("ROLE_ORGANIZATION_CONFLICT"));
});

test("fails closed when role authority does not corroborate the qualified sponsor-map claim", () => {
  const result = compile([
    sponsorCandidate()
  ], [
    roleObservation({ authorityClass: roleField("INFLUENCER") })
  ]);

  assert.equal(result.proposals.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("ROLE_AUTHORITY_CONFLICT"));
});

test("does not populate a current role when freshness logic requires verification", () => {
  const result = compile([
    sponsorCandidate()
  ], [
    roleObservation({ observedAt: "2025-12-01T09:00:00.000Z" })
  ]);

  assert.equal(result.proposals.length, 0);
  assert.equal(result.decisions[0].disposition, "REVIEW_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("ROLE_NOT_CURRENT_SUPPORTED"));
  assert.ok(result.decisions[0].reasonCodes.includes("ROLE_AUTHORITY_NOT_USABLE"));
});

test("merges duplicate qualified observations into one idempotent role proposal without inflating edge count", () => {
  const first = sponsorCandidate({
    candidateId: "candidate:a",
    duplicateKey: "candidate:a",
    sourceRef: "source:a",
    evidenceRefs: ["evidence:a"]
  });
  const second = sponsorCandidate({
    candidateId: "candidate:b",
    duplicateKey: "candidate:b",
    sourceRef: "source:b",
    evidenceRefs: ["evidence:b"]
  });

  const forward = compile([first, second]);
  const reverse = compile([second, first]);

  assert.equal(forward.proposals.length, 1);
  assert.equal(forward.counts.duplicatesMerged, 1);
  assert.deepEqual(forward.proposals, reverse.proposals);
  assert.deepEqual(forward.decisions, reverse.decisions);
  assert.deepEqual(forward.proposals[0].candidateIds, ["candidate:a", "candidate:b"]);
  assert.deepEqual(forward.proposals[0].sourceRefs, ["source:a", "source:b"]);
  assert.ok(forward.proposals[0].evidenceRefs.includes("evidence:a"));
  assert.ok(forward.proposals[0].evidenceRefs.includes("evidence:b"));
  assert.equal(forward.decisions.find((item) => item.candidateId === "candidate:a")?.disposition, "PROPOSE_EDGE");
  assert.equal(forward.decisions.find((item) => item.candidateId === "candidate:b")?.disposition, "MERGED_DUPLICATE");
  assert.equal(forward.decisions[0].proposalId, forward.decisions[1].proposalId);
});

test("blocks duplicate sources that disagree about the person's sponsor-side role instead of choosing a preferred claim", () => {
  const result = compile([
    sponsorCandidate({
      candidateId: "candidate:sponsor-side",
      duplicateKey: "candidate:sponsor-side",
      ecosystemRole: sponsorField("SPONSOR_SIDE")
    }),
    sponsorCandidate({
      candidateId: "candidate:property-side",
      duplicateKey: "candidate:property-side",
      ecosystemRole: sponsorField("PROPERTY_SIDE")
    })
  ]);

  assert.equal(result.proposals.length, 0);
  assert.equal(result.counts.reviewRequired, 2);
  for (const decision of result.decisions) {
    assert.deepEqual(decision.reasonCodes, ["CONFLICTING_QUALIFIED_ROLE_CLAIMS"]);
  }
});

test("preserves conflicting access-path evidence without manufacturing a warm-path graph edge", () => {
  const result = compile([
    sponsorCandidate({
      candidateId: "candidate:warm",
      duplicateKey: "candidate:warm",
      accessPath: sponsorField("WARM", "KNOWN", ["evidence:warm"])
    }),
    sponsorCandidate({
      candidateId: "candidate:cold",
      duplicateKey: "candidate:cold",
      accessPath: sponsorField("COLD", "KNOWN", ["evidence:cold"])
    })
  ]);

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].accessPath.state, "CONFLICTED");
  assert.equal(result.proposals[0].accessPath.value, null);
  assert.deepEqual(result.proposals[0].accessPath.evidenceRefs, ["evidence:cold", "evidence:warm"]);
  assert.equal(result.proposals[0].warmPathEdgeCreated, false);
  assert.equal(result.warmPathEdgeCreated, false);
});

test("does not treat a public professional route as contact information", () => {
  const result = compile([sponsorCandidate({ contactRoute: sponsorField("PUBLIC_PROFESSIONAL") })]);

  assert.equal(result.proposals[0].contactRoute.value, "PUBLIC_PROFESSIONAL");
  assert.equal(result.proposals[0].contactCoordinateIncluded, false);
  assert.equal(result.contactInfoInferred, false);
  assert.equal(JSON.stringify(result).includes("@"), false);
});

test("requires newer sponsor evidence to satisfy role-authority revalidation after a material role change", () => {
  const roles: DecisionMakerRoleObservationV1[] = [
    roleObservation({
      observationId: "role:old",
      canonicalOrganizationRef: "org:old-brand",
      observedAt: "2026-08-01T09:00:00.000Z",
      title: roleField("Director, Partnerships")
    }),
    roleObservation({
      observationId: "role:new",
      observedAt: "2026-09-18T09:00:00.000Z"
    })
  ];
  const staleSponsorEvidence = sponsorCandidate({ observedAt: "2026-09-17T10:00:00.000Z" });
  const result = compile([staleSponsorEvidence], roles);

  assert.equal(result.proposals.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("ROLE_REVALIDATION_NOT_SATISFIED"));

  const corroborated = compile([
    sponsorCandidate({ observedAt: "2026-09-18T10:00:00.000Z" })
  ], roles);
  assert.equal(corroborated.proposals.length, 1);
});

test("returns immutable deterministic output and never mutates the supplied upstream projections", () => {
  const sponsorResult = qualifySponsorMapCandidatesV1({ candidates: [sponsorCandidate()], now: NOW });
  const roleResult = reconcileDecisionMakerRoleFreshnessV1({ observations: [roleObservation()], now: NOW });
  const beforeSponsor = JSON.stringify(sponsorResult.decisions);
  const beforeRole = JSON.stringify(roleResult.roles);

  const first = compileRelationshipGraphPopulationV1({ sponsorDecisions: sponsorResult.decisions, roleProjections: roleResult.roles, now: NOW });
  const second = compileRelationshipGraphPopulationV1({ sponsorDecisions: sponsorResult.decisions, roleProjections: roleResult.roles, now: NOW });

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(sponsorResult.decisions), beforeSponsor);
  assert.equal(JSON.stringify(roleResult.roles), beforeRole);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.proposals), true);
  assert.equal(Object.isFrozen(first.proposals[0]), true);
});
