import assert from "node:assert/strict";
import test from "node:test";

import {
  compileRelationshipSignalDeltasV1,
  type CanonicalRelationshipSnapshotV1,
  type RelationshipSignalV1
} from "../../src/lib/relationship-intelligence/relationship-signal-delta-v1";
import {
  compileRelationshipGraphChangeProposalsV1,
  type RelationshipGraphChangeProposalInputV1
} from "../../src/lib/relationship-intelligence/relationship-graph-change-proposal-v1";

const SOURCE_NOW = "2026-09-18T20:00:00.000Z";
const EVALUATED_AT = "2026-09-18T20:30:00.000Z";

function signal(overrides: Partial<RelationshipSignalV1> = {}): RelationshipSignalV1 {
  return {
    signalId: "signal-1",
    sourceEventKey: "story-1",
    sourceRef: "boardroom:story-1",
    observedAt: "2026-09-18T19:00:00.000Z",
    truthState: "KNOWN",
    signalType: "SPONSORSHIP_ANNOUNCEMENT",
    subjectEntityRef: "org:sponsor",
    objectEntityRef: "org:property",
    relationshipKind: "SPONSOR_OF",
    relationshipStatus: "ACTIVE",
    evidenceRefs: ["evidence:story-1"],
    ...overrides
  };
}

function current(overrides: Partial<CanonicalRelationshipSnapshotV1> = {}): CanonicalRelationshipSnapshotV1 {
  return {
    relationshipRef: "relationship:sponsor-property",
    subjectEntityRef: "org:sponsor",
    objectEntityRef: "org:property",
    relationshipKind: "SPONSOR_OF",
    relationshipStatus: "ACTIVE",
    truthState: "KNOWN",
    evidenceRefs: ["evidence:crm-1"],
    lastVerifiedAt: "2026-09-10T12:00:00.000Z",
    ...overrides
  };
}

function projection(
  signals: readonly RelationshipSignalV1[],
  currentRelationships: readonly CanonicalRelationshipSnapshotV1[] = []
) {
  return compileRelationshipSignalDeltasV1({
    signals,
    currentRelationships,
    now: SOURCE_NOW,
    maximumSignalAgeDays: 30,
    maximumCurrentRelationshipAgeDays: 180
  });
}

function compile(
  sourceProjection = projection([signal()]),
  overrides: Partial<RelationshipGraphChangeProposalInputV1> = {}
) {
  return compileRelationshipGraphChangeProposalsV1({
    projection: sourceProjection,
    evaluatedAt: EVALUATED_AT,
    maximumProjectionAgeMinutes: 60,
    ...overrides
  });
}

test("proposes an exact evidence-backed sponsorship edge for internal graph review without creating truth", () => {
  const result = compile();
  const proposal = result.proposals[0];
  const decision = result.decisions[0];

  assert.equal(result.status, "READY");
  assert.equal(decision.disposition, "PROPOSE_ADD");
  assert.equal(proposal.operation, "ADD_RELATIONSHIP");
  assert.equal(proposal.subjectEntityRef, "org:sponsor");
  assert.equal(proposal.objectEntityRef, "org:property");
  assert.equal(proposal.relationshipKind, "SPONSOR_OF");
  assert.equal(proposal.relationshipStatus, "ACTIVE");
  assert.deepEqual(proposal.signalEvidenceRefs, ["evidence:story-1"]);
  assert.equal(proposal.matchedRelationshipRef, null);
  assert.equal(proposal.truthState, "KNOWN");
  assert.equal(proposal.confidence, "NOT_ESTABLISHED");
  assert.equal(proposal.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(proposal.decisionAuthority, "NOT_ESTABLISHED");
  assert.equal(proposal.opportunityImplication, "NOT_ESTABLISHED");
  assert.equal(proposal.monetaryValue, null);
  assert.equal(proposal.writeAuthority, "NONE");
  assert.equal(result.authority.relationshipGraphMutationAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.opportunityMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("proposes ending only the exact current relationship supported by an evidenced end signal", () => {
  const result = compile(projection([
    signal({ signalType: "SPONSORSHIP_END", relationshipStatus: "ENDED" })
  ], [current()]));
  const proposal = result.proposals[0];

  assert.equal(result.decisions[0].disposition, "PROPOSE_END");
  assert.equal(proposal.operation, "END_RELATIONSHIP");
  assert.equal(proposal.relationshipStatus, "ENDED");
  assert.equal(proposal.matchedRelationshipRef, "relationship:sponsor-property");
  assert.deepEqual(proposal.matchedRelationshipEvidenceRefs, ["evidence:crm-1"]);
});

test("keeps an exact already-current relationship as no-change rather than proposing a duplicate edge", () => {
  const result = compile(projection([signal()], [current()]));

  assert.equal(result.decisions[0].disposition, "NO_CHANGE");
  assert.equal(result.proposals.length, 0);
  assert.equal(result.counts.noChange, 1);
});

test("fails closed when a sponsorship signal is paired with a non-sponsorship relationship kind", () => {
  const source = projection([
    signal({ relationshipKind: "PARTNER_OF" })
  ]);
  assert.equal(source.decisions[0].disposition, "NEW_RELATIONSHIP_CANDIDATE");

  const result = compile(source);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.proposals.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("SPONSORSHIP_SIGNAL_REQUIRES_SPONSOR_OF_KIND"));
});

test("does not promote a charity-event observation into a durable relationship edge", () => {
  const source = projection([
    signal({
      signalType: "FOUNDATION_CHARITY_EVENT",
      relationshipKind: "SUPPORTS_FOUNDATION",
      subjectEntityRef: "org:brand",
      objectEntityRef: "org:foundation"
    })
  ]);
  assert.equal(source.decisions[0].disposition, "NEW_RELATIONSHIP_CANDIDATE");

  const result = compile(source);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.proposals.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("EVENT_SIGNAL_DOES_NOT_ESTABLISH_DURABLE_RELATIONSHIP"));
});

test("requires a specific classified relationship before a generic signal can change the graph", () => {
  const result = compile(projection([
    signal({ signalType: "OTHER_RELATIONSHIP_SIGNAL", relationshipKind: "PARTNER_OF" })
  ]));

  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.proposals.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("OTHER_RELATIONSHIP_SIGNAL_REQUIRES_SPECIFIC_CLASSIFICATION"));
});

test("does not create an ended historical edge when no current relationship exists", () => {
  const result = compile(projection([
    signal({
      signalType: "EXECUTIVE_ROLE_CHANGE",
      relationshipKind: "EMPLOYED_BY",
      relationshipStatus: "ENDED",
      subjectEntityRef: "person:exec",
      objectEntityRef: "org:brand"
    })
  ]));

  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.proposals.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("ENDED_SIGNAL_WITHOUT_EXISTING_RELATIONSHIP_REQUIRES_HISTORY_REVIEW"));
});

test("preserves upstream verification rather than manufacturing a graph proposal", () => {
  const result = compile(projection([
    signal({ truthState: "PARTIAL" })
  ]));

  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.proposals.length, 0);
  assert.ok(result.decisions[0].reasonCodes.includes("SIGNAL_TRUTH_PARTIAL_REQUIRES_VERIFICATION"));
});

test("blocks stale and future source projections under explicit caller-owned freshness", () => {
  const stale = compile(projection([signal()]), {
    evaluatedAt: "2026-09-18T23:00:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.deepEqual(stale.issues, ["SOURCE_PROJECTION_STALE"]);
  assert.equal(stale.proposals.length, 0);

  const future = compile(projection([signal()]), {
    evaluatedAt: "2026-09-18T19:59:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(future.status, "BLOCKED");
  assert.deepEqual(future.issues, ["SOURCE_PROJECTION_GENERATED_IN_FUTURE"]);
});

test("blocks widened upstream mutation authority instead of trusting a forged projection", () => {
  const source = projection([signal()]);
  const forged = {
    ...source,
    graphMutationPerformed: true
  } as unknown as typeof source;

  const result = compile(forged);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("UPSTREAM_GRAPH_MUTATION_NOT_ALLOWED"));
  assert.equal(result.proposals.length, 0);
});

test("blocks inconsistent projection counts and duplicate delta identities", () => {
  const source = projection([
    signal({ signalId: "a", sourceEventKey: "a", sourceRef: "official:a" }),
    signal({ signalId: "b", sourceEventKey: "b", sourceRef: "official:b", subjectEntityRef: "org:other" })
  ]);
  const forged = {
    ...source,
    decisions: [source.decisions[0], { ...source.decisions[1], deltaId: source.decisions[0].deltaId }]
  } as typeof source;

  const result = compile(forged);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("SOURCE_PROJECTION_DUPLICATE_DELTA_ID"));
});

test("blocks secret-like provenance before it can enter a graph proposal", () => {
  const source = projection([signal()]);
  const forged = {
    ...source,
    decisions: [{ ...source.decisions[0], evidenceRefs: ["op://vault/item/field"] }]
  } as typeof source;

  const result = compile(forged);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("SOURCE_PROJECTION_UNSAFE_OR_INVALID_PROVENANCE"));
  assert.equal(result.proposals.length, 0);
});

test("is deterministic, deeply immutable, and grants no consequential authority", () => {
  const source = projection([signal()]);
  const input: RelationshipGraphChangeProposalInputV1 = {
    projection: source,
    evaluatedAt: EVALUATED_AT,
    maximumProjectionAgeMinutes: 60
  };
  const before = JSON.stringify(input);
  const first = compileRelationshipGraphChangeProposalsV1(input);
  const second = compileRelationshipGraphChangeProposalsV1(input);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.proposals), true);
  assert.equal(Object.isFrozen(first.proposals[0]), true);
  assert.equal(first.inferencePolicy, "EXACT_CANONICAL_DELTA_ONLY_NO_DIRECTION_KIND_OPPORTUNITY_OR_VALUE_INFERENCE");
  assert.equal(first.authority.relationshipGraphMutationAuthorized, false);
  assert.equal(first.authority.contactDiscoveryAuthorized, false);
  assert.equal(first.authority.outreachAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
});
