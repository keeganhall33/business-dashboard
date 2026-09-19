import assert from "node:assert/strict";
import test from "node:test";

import {
  compileRelationshipGraphCanonicalReviewHandoffV1
} from "../../src/lib/relationship-intelligence/relationship-graph-canonical-review-handoff-v1";
import {
  RELATIONSHIP_GRAPH_POPULATION_VERSION_V1,
  type RelationshipGraphPopulationResultV1
} from "../../src/lib/relationship-intelligence/relationship-graph-population-v1";

const GENERATED_AT = "2026-09-19T19:00:00.000Z";
const EVALUATED_AT = "2026-09-19T20:00:00.000Z";

function population(overrides: Partial<RelationshipGraphPopulationResultV1> = {}): RelationshipGraphPopulationResultV1 {
  const proposalId = "relationship-role:abc123";
  return {
    version: RELATIONSHIP_GRAPH_POPULATION_VERSION_V1,
    generatedAt: GENERATED_AT,
    proposals: [{
      proposalId,
      idempotencyKey: proposalId,
      relationshipType: "PERSON_ROLE_AT_ORGANIZATION",
      canonicalPersonRef: "person:buyer",
      canonicalOrganizationRef: "org:brand",
      title: "VP, Sports Marketing",
      decisionFunction: "SPORTS_MARKETING",
      authorityClass: "DECISION_MAKER",
      ecosystemRole: "SPONSOR_SIDE",
      accessPath: { state: "KNOWN", value: "WARM", evidenceRefs: ["evidence:warm"] },
      contactRoute: { state: "KNOWN", value: "PUBLIC_PROFESSIONAL", evidenceRefs: ["evidence:route"] },
      planningWindow: { state: "KNOWN", value: "2027 planning underway", evidenceRefs: ["evidence:window"] },
      eventOrSeasonDate: { state: "UNKNOWN", value: null, evidenceRefs: [] },
      candidateIds: ["candidate:buyer"],
      sourceRefs: ["source:official-brand-bio"],
      evidenceRefs: ["evidence:buyer-role", "evidence:warm", "evidence:route", "evidence:window"],
      observedThrough: "2026-09-19T18:00:00.000Z",
      truthState: "KNOWN",
      currentRoleVerified: true,
      warmPathEdgeCreated: false,
      sponsorshipRelationshipEdgeCreated: false,
      contactCoordinateIncluded: false,
      writeAuthority: "NONE"
    }],
    decisions: [{
      candidateId: "candidate:buyer",
      disposition: "PROPOSE_EDGE",
      proposalId,
      duplicateOfCandidateId: null,
      reasonCodes: ["EDGE_READY"],
      evidenceRefs: ["evidence:buyer-role", "evidence:warm", "evidence:route", "evidence:window"],
      requiresVerification: false
    }],
    counts: {
      candidatesReviewed: 1,
      edgesProposed: 1,
      duplicatesMerged: 0,
      reviewRequired: 0,
      skipped: 0
    },
    crmMutationPerformed: false,
    relationshipGraphMutationPerformed: false,
    warmPathEdgeCreated: false,
    sponsorshipRelationshipEdgeCreated: false,
    contactInfoInferred: false,
    externalResearchPerformed: false,
    externalActionPerformed: false,
    ...overrides
  };
}

function compile(source: RelationshipGraphPopulationResultV1 = population()) {
  return compileRelationshipGraphCanonicalReviewHandoffV1({
    population: source,
    evaluatedAt: EVALUATED_AT,
    maximumPopulationAgeMinutes: 180
  });
}

test("hands one exact evidence-backed current role to canonical review without granting graph write authority", () => {
  const result = compile();

  assert.equal(result.status, "READY");
  assert.equal(result.handoffs.length, 1);
  assert.equal(result.decisions[0].disposition, "READY_FOR_CANONICAL_REVIEW");
  assert.deepEqual(result.decisions[0].reasonCodes, ["EXACT_EVIDENCE_BACKED_ROLE_PROPOSAL_READY"]);

  const handoff = result.handoffs[0];
  assert.equal(handoff.canonicalPersonRef, "person:buyer");
  assert.equal(handoff.canonicalOrganizationRef, "org:brand");
  assert.equal(handoff.title, "VP, Sports Marketing");
  assert.equal(handoff.ecosystemRole, "SPONSOR_SIDE");
  assert.equal(handoff.canonicalState, "REVIEW_CANDIDATE_ONLY");
  assert.equal(handoff.writeAuthority, "NONE");
  assert.equal(result.authority.relationshipGraphMutationAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
});

test("preserves warm access only as evidence-backed context and never turns it into an introduction edge", () => {
  const result = compile();

  assert.equal(result.handoffs[0].accessPath.state, "KNOWN");
  assert.equal(result.handoffs[0].accessPath.value, "WARM");
  assert.equal(result.authority.warmPathInferenceAuthorized, false);
  assert.equal(result.authority.sponsorshipInferenceAuthorized, false);
});

test("preserves contact-route classification without contact coordinates or private-contact inference", () => {
  const result = compile();

  assert.equal(result.handoffs[0].contactRoute.value, "PUBLIC_PROFESSIONAL");
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(JSON.stringify(result).includes("@"), false);
});

test("blocks the source artifact when upstream counts drift from its decisions and proposals", () => {
  const source = population({
    counts: {
      candidatesReviewed: 2,
      edgesProposed: 1,
      duplicatesMerged: 0,
      reviewRequired: 0,
      skipped: 0
    }
  });
  const result = compile(source);

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.issues, ["SOURCE_COUNT_MISMATCH"]);
  assert.equal(result.handoffs.length, 0);
  assert.equal(result.decisions.length, 0);
});

test("blocks stale or future-dated source populations rather than trusting their role truth", () => {
  const stale = compile(population({ generatedAt: "2026-09-19T10:00:00.000Z" }));
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("SOURCE_POPULATION_STALE"));

  const future = compile(population({ generatedAt: "2026-09-20T10:00:00.000Z" }));
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.includes("SOURCE_GENERATED_IN_FUTURE"));
});

test("blocks any upstream widening into graph mutation, warm-path creation, sponsorship edges, contact inference, research, or external action", () => {
  const widened = [
    population({ relationshipGraphMutationPerformed: true as false }),
    population({ warmPathEdgeCreated: true as false }),
    population({ sponsorshipRelationshipEdgeCreated: true as false }),
    population({ contactInfoInferred: true as false }),
    population({ externalResearchPerformed: true as false }),
    population({ externalActionPerformed: true as false })
  ];

  for (const source of widened) {
    const result = compile(source);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.handoffs.length, 0);
  }
});

test("requires the exact upstream PROPOSE_EDGE decision bound to the same proposal", () => {
  const source = population();
  const tampered: RelationshipGraphPopulationResultV1 = {
    ...source,
    decisions: source.decisions.map((item) => ({ ...item, proposalId: "relationship-role:different" }))
  };
  const result = compile(tampered);

  assert.equal(result.status, "READY");
  assert.equal(result.handoffs.length, 0);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("EXACT_PROPOSE_EDGE_DECISION_REQUIRED"));
  assert.ok(result.decisions[0].reasonCodes.includes("CANDIDATE_DECISION_LINEAGE_MISMATCH"));
});

test("requires the proposal candidate set to match the bound source-decision lineage exactly", () => {
  const source = population();
  const tampered: RelationshipGraphPopulationResultV1 = {
    ...source,
    proposals: source.proposals.map((item) => ({ ...item, candidateIds: ["candidate:buyer", "candidate:unproven"] }))
  };
  const result = compile(tampered);

  assert.equal(result.status, "READY");
  assert.equal(result.handoffs.length, 0);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("CANDIDATE_DECISION_LINEAGE_MISMATCH"));
});

test("fails a proposal closed when its observation occurs after population or in the future", () => {
  const source = population();
  const tampered: RelationshipGraphPopulationResultV1 = {
    ...source,
    proposals: source.proposals.map((item) => ({ ...item, observedThrough: "2026-09-19T20:30:00.000Z" }))
  };
  const result = compile(tampered);

  assert.equal(result.status, "READY");
  assert.equal(result.handoffs.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("OBSERVATION_AFTER_SOURCE_POPULATION"));
  assert.ok(result.decisions[0].reasonCodes.includes("OBSERVATION_IN_FUTURE"));
});

test("fails unsafe evidence provenance closed instead of passing credential-like material downstream", () => {
  const source = population();
  const tampered: RelationshipGraphPopulationResultV1 = {
    ...source,
    proposals: source.proposals.map((item) => ({ ...item, evidenceRefs: ["token=should-not-pass"] }))
  };
  const result = compile(tampered);

  assert.equal(result.status, "READY");
  assert.equal(result.handoffs.length, 0);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("UNSAFE_OR_INVALID_PROPOSAL_PROVENANCE"));
});

test("preserves conflicted context as conflicted rather than choosing warm access or a planning claim", () => {
  const source = population();
  const tampered: RelationshipGraphPopulationResultV1 = {
    ...source,
    proposals: source.proposals.map((item) => ({
      ...item,
      accessPath: { state: "CONFLICTED", value: null, evidenceRefs: ["evidence:warm", "evidence:cold"] },
      planningWindow: { state: "CONFLICTED", value: null, evidenceRefs: ["evidence:window-a", "evidence:window-b"] }
    }))
  };
  const result = compile(tampered);

  assert.equal(result.handoffs.length, 1);
  assert.equal(result.handoffs[0].accessPath.state, "CONFLICTED");
  assert.equal(result.handoffs[0].accessPath.value, null);
  assert.equal(result.handoffs[0].planningWindow.state, "CONFLICTED");
  assert.equal(result.handoffs[0].planningWindow.value, null);
});

test("is deterministic, deeply immutable, and does not mutate the upstream population", () => {
  const source = population();
  const before = JSON.stringify(source);
  const first = compile(source);
  const second = compile(source);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.handoffs), true);
  assert.equal(Object.isFrozen(first.handoffs[0]), true);
  assert.equal(Object.isFrozen(first.handoffs[0].evidenceRefs), true);
});
