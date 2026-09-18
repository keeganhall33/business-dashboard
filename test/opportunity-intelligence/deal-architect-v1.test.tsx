import assert from "node:assert/strict";
import test from "node:test";

import {
  architectDealStructuresV1,
  DealArchitectError,
  type CanonicalDealComponentV1,
  type CanonicalDealStakeholderV1,
  type DealArchitectInputV1,
  type DealArchetypeV1,
  type DealEconomicsEvidenceV1
} from "../../src/lib/opportunity-intelligence/deal-architect-v1";
import type { RelationshipPathV1 } from "../../src/lib/relationship-intelligence/relationship-pathfinder-v1";

const generatedAt = "2026-09-18T05:00:00.000Z";

function relationshipPath(): RelationshipPathV1 {
  return {
    pathId: "path-1",
    entityIds: ["keegan", "decision-maker"],
    edgeIds: ["edge-1"],
    hops: 1,
    readiness: "READY",
    weakestEdge: { edgeId: "edge-1", reason: "SUPPORTED_BOTTLENECK" },
    authorityBoundary: {
      targetEntityId: "decision-maker",
      level: "DECISION_MAKER",
      roleRelevance: "HIGH",
      truthState: "KNOWN",
      decisionAuthorityConfirmed: true
    },
    timing: { weakestWindow: "OPEN", rationale: "Supported planning window is open." },
    blockers: [],
    evidenceRefs: ["evidence:path"],
    edges: [{
      edgeId: "edge-1",
      canonicalRef: "crm:relationship:edge-1",
      fromEntityId: "keegan",
      toEntityId: "decision-maker",
      relationshipState: "KNOWN",
      evidenceQuality: "HIGH",
      strength: "STRONG",
      freshness: "FRESH",
      willingness: "LIKELY",
      contextFit: "HIGH",
      introductionAppropriate: true,
      introductionReason: "A documented warm introduction is appropriate.",
      targetAuthority: "DECISION_MAKER",
      targetRoleRelevance: "HIGH",
      timing: "OPEN",
      blockers: [],
      evidenceRefs: ["evidence:path"]
    }]
  };
}

const stakeholderRoles: CanonicalDealStakeholderV1["role"][] = [
  "RIGHTS_HOLDER",
  "SPONSOR_FUNDER",
  "CHARITY",
  "BUYER_COLLECTOR",
  "DISTRIBUTION",
  "PUBLICITY",
  "TALENT_PARTNER"
];

function stakeholders(): CanonicalDealStakeholderV1[] {
  return stakeholderRoles.map((role, index) => ({
    stakeholderId: `stakeholder-${index}`,
    role,
    entityRef: `crm:org:${role.toLowerCase()}`,
    valueStatement: {
      state: "KNOWN",
      value: `Supported value proposition for ${role}.`,
      evidenceRefs: [`evidence:stakeholder:${index}`]
    },
    required: true
  }));
}

const componentTypes: CanonicalDealComponentV1["type"][] = [
  "ORIGINAL",
  "EDITION",
  "VIP",
  "FAN",
  "CHARITY",
  "PUBLICITY",
  "CONTENT",
  "EVENT"
];

function components(): CanonicalDealComponentV1[] {
  return componentTypes.map((type, index) => ({
    componentId: `component-${index}`,
    type,
    canonicalRef: `opportunity:component:${type.toLowerCase()}`,
    state: "KNOWN",
    evidenceRefs: [`evidence:component:${index}`],
    requiredKeeganHours: type === "ORIGINAL" ? 100 : 2
  }));
}

function economics(): DealEconomicsEvidenceV1[] {
  const archetypes: DealArchetypeV1[] = ["COLLECTOR_ONE_OF_ONE", "SPONSOR_FUNDED_CHARITY", "VIP_FAN_ACTIVATION"];
  return archetypes.map((archetype, index) => ({
    archetype,
    currency: "USD",
    revenueRange: { state: "KNOWN", value: { min: 10_000 + index * 5_000, max: 25_000 + index * 10_000 }, evidenceRefs: [`evidence:econ:${index}:revenue`] },
    directCostRange: { state: "KNOWN", value: { min: 500, max: 2_000 }, evidenceRefs: [`evidence:econ:${index}:cost`] },
    sponsorFundingRange: { state: "KNOWN", value: { min: 5_000, max: 15_000 }, evidenceRefs: [`evidence:econ:${index}:sponsor`] },
    charitableProceedsRange: { state: "KNOWN", value: { min: 2_000, max: 10_000 }, evidenceRefs: [`evidence:econ:${index}:charity`] }
  }));
}

function input(overrides: Partial<DealArchitectInputV1> = {}): DealArchitectInputV1 {
  return {
    opportunityId: "opp-1",
    opportunityRef: "crm:opportunity:opp-1",
    opportunityTitle: "Evidence-backed activation",
    qualificationState: "QUALIFIED",
    generatedAt,
    stakeholders: stakeholders(),
    components: components(),
    economics: economics(),
    rights: [{
      rightId: "right-image",
      canonicalRef: "rights:image:1",
      label: "Approved image/reference rights",
      required: true,
      state: "GRANTED",
      evidenceRefs: ["evidence:rights"]
    }],
    decisionMakers: [{
      decisionMakerId: "dm-1",
      entityRef: "crm:person:decision-maker",
      role: "Partnership decision maker",
      authority: "DECISION_MAKER",
      truthState: "KNOWN",
      evidenceRefs: ["evidence:authority"]
    }],
    planningWindow: {
      state: "OPEN",
      opensAt: "2026-09-01T00:00:00.000Z",
      closesAt: "2027-02-01T00:00:00.000Z",
      evidenceRefs: ["evidence:window"],
      rationale: "Planning is open with sufficient production runway."
    },
    availableKeeganHours: { state: "KNOWN", value: 500, evidenceRefs: ["evidence:capacity"] },
    distributionPath: { state: "KNOWN", value: "Partner-owned collector and event distribution.", evidenceRefs: ["evidence:distribution"] },
    publicityHook: { state: "KNOWN", value: "A documented milestone gives the activation a timely editorial hook.", evidenceRefs: ["evidence:publicity"] },
    relationshipPaths: [relationshipPath()],
    dependencies: ["rights approval remains valid"],
    risks: ["production schedule compression"],
    ...overrides
  };
}

test("produces three materially distinct evidence-bounded deal structures", () => {
  const result = architectDealStructuresV1(input());

  assert.equal(result.status, "STRUCTURES_READY");
  assert.equal(result.structures.length, 3);
  assert.deepEqual(result.structures.map((structure) => structure.archetype), [
    "COLLECTOR_ONE_OF_ONE",
    "SPONSOR_FUNDED_CHARITY",
    "VIP_FAN_ACTIVATION"
  ]);

  const componentSignatures = result.structures.map((structure) => structure.components.map((component) => component.type).join("|"));
  assert.equal(new Set(componentSignatures).size, 3);
  assert.ok(result.structures.every((structure) => structure.readiness === "PREPARE"));
  assert.ok(result.structures.every((structure) => structure.evidenceRefs.length > 0));
});

test("preserves economics provenance and refuses unsupported monetary precision", () => {
  const sparseEconomics = economics();
  sparseEconomics[0] = {
    ...sparseEconomics[0],
    revenueRange: { state: "HYPOTHESIS", value: { min: 100_000, max: 200_000 }, evidenceRefs: [] }
  };
  const result = architectDealStructuresV1(input({ economics: sparseEconomics }));
  const collector = result.structures.find((structure) => structure.archetype === "COLLECTOR_ONE_OF_ONE");

  assert.equal(collector?.economics.revenueRange.state, "HYPOTHESIS");
  assert.equal(collector?.economics.revenueRange.value, null);
  assert.deepEqual(collector?.economics.revenueRange.evidenceRefs, []);
  assert.ok(collector?.researchNeeds.includes("VERIFY_REVENUE_ECONOMICS"));
  assert.equal(collector?.readiness, "RESEARCH_REQUIRED");
});

test("blocks structures when required rights are pending or capacity is exceeded", () => {
  const result = architectDealStructuresV1(input({
    rights: [{
      rightId: "right-image",
      canonicalRef: "rights:image:1",
      label: "Image/reference rights",
      required: true,
      state: "PENDING",
      evidenceRefs: ["evidence:rights:pending"]
    }],
    availableKeeganHours: { state: "KNOWN", value: 50, evidenceRefs: ["evidence:capacity"] }
  }));

  const collector = result.structures.find((structure) => structure.archetype === "COLLECTOR_ONE_OF_ONE");
  assert.equal(collector?.readiness, "BLOCKED");
  assert.ok(collector?.blockers.includes("RIGHT_PENDING:right-image"));
  assert.ok(collector?.blockers.includes("KEEGAN_CAPACITY_EXCEEDED"));
});

test("marks planning-window decay and kills structures after the supported window closes", () => {
  const decaying = architectDealStructuresV1(input({
    planningWindow: {
      state: "OPEN",
      opensAt: "2026-09-01T00:00:00.000Z",
      closesAt: "2026-10-01T00:00:00.000Z",
      evidenceRefs: ["evidence:window"],
      rationale: "Supported window is approaching its close."
    }
  }));
  assert.ok(decaying.structures.every((structure) => structure.planningWindow.urgency === "DECAYING"));

  const expired = architectDealStructuresV1(input({
    planningWindow: {
      state: "CLOSED",
      opensAt: "2026-06-01T00:00:00.000Z",
      closesAt: "2026-09-01T00:00:00.000Z",
      evidenceRefs: ["evidence:window:closed"],
      rationale: "The documented planning window closed."
    }
  }));
  assert.equal(expired.status, "BLOCKED");
  assert.ok(expired.structures.every((structure) => structure.readiness === "KILL"));
  assert.ok(expired.structures.every((structure) => structure.blockers.includes("PLANNING_WINDOW_EXPIRED")));
});

test("preserves stakeholder UNKNOWN and requires bounded research rather than inventing value or identity", () => {
  const sparse = stakeholders();
  sparse[1] = {
    ...sparse[1],
    entityRef: null,
    valueStatement: { state: "UNKNOWN", value: "invented value must not survive", evidenceRefs: [] }
  };
  const result = architectDealStructuresV1(input({ stakeholders: sparse }));
  const sponsor = result.structures[0].stakeholders.find((stakeholder) => stakeholder.role === "SPONSOR_FUNDER");

  assert.equal(sponsor?.entityRef, null);
  assert.equal(sponsor?.valueState, "UNKNOWN");
  assert.equal(sponsor?.valueStatement, null);
  assert.ok(result.structures[0].researchNeeds.some((need) => need.startsWith("RESOLVE_STAKEHOLDER:")));
  assert.ok(result.structures[0].researchNeeds.some((need) => need.startsWith("VERIFY_STAKEHOLDER_VALUE:")));
});

test("keeps all consequential authority behind Keegan approval", () => {
  const result = architectDealStructuresV1(input());

  assert.equal(result.actionAuthority.analysisOnly, true);
  assert.equal(result.actionAuthority.externalActionAuthorized, false);
  for (const structure of result.structures) {
    assert.equal(structure.approval.keeganApprovalRequired, true);
    assert.equal(structure.approval.externalActionAuthorized, false);
    assert.equal(structure.approval.spendAuthorized, false);
    assert.equal(structure.approval.contractAuthorized, false);
    assert.equal(structure.approval.rightsCommitmentAuthorized, false);
    assert.equal(structure.approval.outreachAuthorized, false);
    assert.ok(structure.nextSafePreparedAction.includes("do not contact, spend, contract, or commit rights"));
    assert.ok(structure.killConditions.length >= 3);
    assert.ok(structure.rollbackConditions.length >= 3);
  }
});

test("does not mutate canonical input and returns deterministic deeply frozen output", () => {
  const request = input();
  const before = structuredClone(request);
  const first = architectDealStructuresV1(request);
  const second = architectDealStructuresV1(request);

  assert.deepEqual(request, before);
  assert.deepEqual(first, second);
  assert.equal(first.resultId, second.resultId);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.structures));
  assert.ok(Object.isFrozen(first.structures[0].components));
});

test("rejects unqualified opportunities and malformed evidence ranges", () => {
  assert.throws(
    () => architectDealStructuresV1(input({ qualificationState: "UNKNOWN" })),
    (error: unknown) => error instanceof DealArchitectError && error.code === "OPPORTUNITY_NOT_QUALIFIED"
  );

  const invalidEconomics = economics();
  invalidEconomics[0] = {
    ...invalidEconomics[0],
    revenueRange: { state: "KNOWN", value: { min: 20_000, max: 10_000 }, evidenceRefs: ["evidence:bad-range"] }
  };
  assert.throws(
    () => architectDealStructuresV1(input({ economics: invalidEconomics })),
    (error: unknown) => error instanceof DealArchitectError && error.code === "INVALID_RANGE"
  );
});
