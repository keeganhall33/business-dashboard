import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewSponsorAccessRoleFreshnessV1
} from "../../src/lib/relationship-intelligence/sponsor-access-role-freshness-review-v1";
import {
  buildSponsorAccessBriefsV1,
  type SponsorAccessBriefInputV1,
  type SponsorAccessBriefResultV1
} from "../../src/lib/relationship-intelligence/sponsor-access-brief-v1";
import {
  reconcileDecisionMakerRoleFreshnessV1,
  type DecisionMakerRoleObservationV1,
  type DecisionMakerRoleFreshnessResultV1,
  type RoleAuthorityClassV1,
  type RoleEvidenceFieldV1,
  type RoleEmploymentStateV1,
  type RoleFreshnessTruthStateV1
} from "../../src/lib/relationship-intelligence/decision-maker-role-freshness-v1";
import type {
  SponsorMapCandidateV1,
  SponsorMapEvidenceFieldV1,
  SponsorMapTruthStateV1
} from "../../src/lib/relationship-intelligence/sponsor-map-qualification-v1";
import type {
  CanonicalRelationshipEdgeRefV1,
  CanonicalRelationshipEntityRefV1
} from "../../src/lib/relationship-intelligence/relationship-pathfinder-v1";

const NOW = "2026-09-18T08:00:00.000Z";

function sponsorField<T>(
  value: T | null,
  state: SponsorMapTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:sponsor-field"]
): SponsorMapEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function sponsor(overrides: Partial<SponsorMapCandidateV1> = {}): SponsorMapCandidateV1 {
  return {
    candidateId: "sponsor-target",
    sourceRef: "source:official-company-bio",
    observedAt: "2026-09-17T18:00:00.000Z",
    evidenceRefs: ["evidence:sponsor-primary"],
    canonicalOrganizationRef: "org:sponsor-brand",
    canonicalPersonRef: "person:sports-marketing-lead",
    duplicateKey: "sponsor-brand:sports-marketing-lead",
    ecosystemRole: sponsorField("SPONSOR_SIDE"),
    decisionFunction: sponsorField("SPORTS_MARKETING"),
    authorityClass: sponsorField("DECISION_MAKER", "KNOWN", ["evidence:sponsor-authority"]),
    accessPath: sponsorField("WARM", "KNOWN", ["evidence:warm-path"]),
    contactRoute: sponsorField("PUBLIC_PROFESSIONAL", "KNOWN", ["evidence:contact-route"]),
    planningWindow: sponsorField("Q4 2026 planning", "KNOWN", ["evidence:planning"]),
    eventOrSeasonDate: sponsorField("2027 season", "KNOWN", ["evidence:season"]),
    ...overrides
  };
}

function entities(): CanonicalRelationshipEntityRefV1[] {
  return [
    { entityId: "keegan", label: "Keegan", canonicalRef: "person:keegan" },
    { entityId: "introducer", label: "Known introducer", canonicalRef: "person:introducer" },
    { entityId: "target", label: "Sponsor decision maker", canonicalRef: "person:sports-marketing-lead" }
  ];
}

function edge(edgeId: string, fromEntityId: string, toEntityId: string): CanonicalRelationshipEdgeRefV1 {
  return {
    edgeId,
    fromEntityId,
    toEntityId,
    canonicalRef: `relationship:${edgeId}`,
    relationshipState: "KNOWN",
    evidenceQuality: "HIGH",
    evidenceRefs: [`evidence:${edgeId}`],
    strength: "STRONG",
    lastMeaningfulInteractionAt: "2026-09-10T12:00:00.000Z",
    staleAfterDays: 180,
    willingness: {
      state: "KNOWN",
      level: "LIKELY",
      evidenceRefs: [`evidence:${edgeId}:willingness`]
    },
    contextFit: {
      state: "KNOWN",
      level: "HIGH",
      evidenceRefs: [`evidence:${edgeId}:context`]
    },
    introduction: {
      state: "KNOWN",
      appropriate: true,
      reason: "The supplied relationship evidence explicitly supports an introduction.",
      evidenceRefs: [`evidence:${edgeId}:intro`]
    },
    targetAuthority: {
      state: "KNOWN",
      level: toEntityId === "target" ? "DECISION_MAKER" : "CONNECTOR",
      roleRelevance: "HIGH",
      evidenceRefs: [`evidence:${edgeId}:authority`]
    },
    timing: {
      state: "KNOWN",
      window: "OPEN",
      rationale: "The supplied relationship evidence supports using this path now.",
      evidenceRefs: [`evidence:${edgeId}:timing`]
    },
    blockers: []
  };
}

function access(overrides: Partial<SponsorAccessBriefInputV1> = {}): SponsorAccessBriefResultV1 {
  return buildSponsorAccessBriefsV1({
    sponsorCandidates: [sponsor()],
    candidateTargetMappings: [{ candidateId: "sponsor-target", targetEntityId: "target" }],
    sourceEntityId: "keegan",
    entities: entities(),
    edges: [edge("keegan-introducer", "keegan", "introducer"), edge("introducer-target", "introducer", "target")],
    now: NOW,
    ...overrides
  });
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
    observationId: "role:current",
    canonicalPersonRef: "person:sports-marketing-lead",
    canonicalOrganizationRef: "org:sponsor-brand",
    observedAt: "2026-09-17T20:00:00.000Z",
    sourceRef: "source:official-sponsor-bio",
    evidenceRefs: ["evidence:official-current-role"],
    truthState: "KNOWN",
    employmentState: roleField<RoleEmploymentStateV1>("CURRENT"),
    title: roleField("VP, Sports Marketing"),
    decisionFunction: roleField("SPORTS_MARKETING"),
    authorityClass: roleField<RoleAuthorityClassV1>("DECISION_MAKER", "KNOWN", ["evidence:role-authority"]),
    ...overrides
  };
}

function roles(observations: readonly DecisionMakerRoleObservationV1[] = [roleObservation()]): DecisionMakerRoleFreshnessResultV1 {
  return reconcileDecisionMakerRoleFreshnessV1({ observations, now: NOW });
}

function review(
  accessResult: SponsorAccessBriefResultV1 = access(),
  roleResult: DecisionMakerRoleFreshnessResultV1 = roles(),
  evaluatedAt: string = NOW,
  maximumProjectionAgeMinutes = 60
) {
  return reviewSponsorAccessRoleFreshnessV1({
    access: accessResult,
    roles: roleResult,
    evaluatedAt,
    maximumProjectionAgeMinutes
  });
}

test("keeps sponsor access ready only when the exact current role and decision authority are freshly confirmed", () => {
  const result = review();
  const item = result.reviews[0];

  assert.equal(result.status, "READY");
  assert.equal(item.upstreamAccessStatus, "ACCESS_READY");
  assert.equal(item.disposition, "CURRENT_ROLE_CONFIRMS_ACCESS_READY");
  assert.equal(item.sponsorOrganizationRef, "org:sponsor-brand");
  assert.equal(item.currentRoleOrganizationRef, "org:sponsor-brand");
  assert.equal(item.sponsorAuthorityClass, "DECISION_MAKER");
  assert.equal(item.currentRoleAuthorityClass, "DECISION_MAKER");
  assert.equal(item.introPreparationAllowed, true);
  assert.equal(result.counts.currentRoleConfirmed, 1);
});

test("a known role departure blocks use of the old sponsor decision authority without erasing relationship history", () => {
  const departed = roles([
    roleObservation({
      observationId: "role:departed",
      employmentState: roleField<RoleEmploymentStateV1>("DEPARTED")
    })
  ]);
  const item = review(access(), departed).reviews[0];

  assert.equal(item.disposition, "VERIFY_ROLE_BEFORE_ACCESS");
  assert.equal(item.currentRoleDisposition, "NO_CURRENT_ROLE_SUPPORTED");
  assert.equal(item.introPreparationAllowed, false);
  assert.equal(item.relationshipHistoryInvalidated, false);
  assert.ok(item.reasonCodes.includes("CURRENT_ROLE_DISPOSITION_NO_CURRENT_ROLE_SUPPORTED"));
});

test("a current role at a different organization cannot be treated as sponsor-side authority for the old organization", () => {
  const changedEmployer = roles([
    roleObservation({ canonicalOrganizationRef: "org:new-brand" })
  ]);
  const item = review(access(), changedEmployer).reviews[0];

  assert.equal(item.disposition, "VERIFY_ROLE_BEFORE_ACCESS");
  assert.equal(item.sponsorOrganizationRef, "org:sponsor-brand");
  assert.equal(item.currentRoleOrganizationRef, "org:new-brand");
  assert.ok(item.reasonCodes.includes("CURRENT_ROLE_ORGANIZATION_MISMATCH"));
  assert.equal(item.introPreparationAllowed, false);
});

test("a newly superseded role authority requires revalidation even when the latest employer still matches", () => {
  const roleResult = roles([
    roleObservation({
      observationId: "role:older",
      observedAt: "2026-08-01T20:00:00.000Z",
      title: roleField("Director, Sports Marketing"),
      authorityClass: roleField<RoleAuthorityClassV1>("INFLUENCER")
    }),
    roleObservation({ observationId: "role:newer" })
  ]);
  const projected = roleResult.roles[0];
  assert.equal(projected.disposition, "CURRENT_ROLE_SUPPORTED");
  assert.equal(projected.authorityRevalidationRequired, true);

  const item = review(access(), roleResult).reviews[0];
  assert.equal(item.disposition, "VERIFY_ROLE_BEFORE_ACCESS");
  assert.ok(item.reasonCodes.includes("CURRENT_ROLE_AUTHORITY_REVALIDATION_REQUIRED"));
  assert.equal(item.relationshipHistoryInvalidated, false);
});

test("missing or incomplete current-role evidence requests research instead of inventing decision authority", () => {
  const missing = roles([]);
  const missingItem = review(access(), missing).reviews[0];
  assert.equal(missingItem.disposition, "ROLE_RESEARCH_REQUIRED");
  assert.ok(missingItem.reasonCodes.includes("NO_CURRENT_ROLE_PROJECTION_FOR_EXACT_CANONICAL_PERSON"));

  const incomplete = roles([
    roleObservation({ authorityClass: roleField<RoleAuthorityClassV1>("UNKNOWN") })
  ]);
  const incompleteItem = review(access(), incomplete).reviews[0];
  assert.equal(incompleteItem.currentRoleDisposition, "CURRENT_ROLE_NEEDS_RESEARCH");
  assert.equal(incompleteItem.disposition, "ROLE_RESEARCH_REQUIRED");
  assert.equal(incompleteItem.introPreparationAllowed, false);
});

test("conflicting sponsor-access and current-role authority fails closed to verification", () => {
  const roleResult = roles([
    roleObservation({ authorityClass: roleField<RoleAuthorityClassV1>("BUDGET_OWNER") })
  ]);
  const item = review(access(), roleResult).reviews[0];

  assert.equal(item.disposition, "VERIFY_ROLE_BEFORE_ACCESS");
  assert.equal(item.sponsorAuthorityClass, "DECISION_MAKER");
  assert.equal(item.currentRoleAuthorityClass, "BUDGET_OWNER");
  assert.ok(item.reasonCodes.includes("SPONSOR_ACCESS_AND_CURRENT_ROLE_AUTHORITY_MISMATCH"));
});

test("never upgrades an upstream sponsor brief that is not already access-ready", () => {
  const notReady = access({
    sponsorCandidates: [sponsor({ accessPath: sponsorField("UNKNOWN", "KNOWN", ["evidence:no-warm-path"]) })]
  });
  assert.equal(notReady.briefs[0].status, "RESEARCH_REQUIRED");

  const item = review(notReady, roles()).reviews[0];
  assert.equal(item.disposition, "UPSTREAM_ACCESS_NOT_READY");
  assert.equal(item.introPreparationAllowed, false);
});

test("fails closed when either source projection is stale or future-dated", () => {
  const stale = review(access(), roles(), "2026-09-18T10:01:00.000Z", 60);
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("ACCESS_SOURCE_STALE"));
  assert.ok(stale.issues.includes("ROLE_SOURCE_STALE"));
  assert.equal(stale.reviews.length, 0);

  const currentAccess = access();
  const futureAccess: SponsorAccessBriefResultV1 = {
    ...currentAccess,
    generatedAt: "2026-09-18T09:00:00.000Z"
  };
  const future = review(futureAccess, roles(), NOW, 60);
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.includes("ACCESS_SOURCE_GENERATED_IN_FUTURE"));
});

test("preserves evidence lineage, is immutable, and grants no mutation or outreach authority", () => {
  const result = review();
  const item = result.reviews[0];

  assert.ok(item.evidenceRefs.includes("evidence:sponsor-authority"));
  assert.ok(item.evidenceRefs.includes("evidence:official-current-role"));
  assert.equal(new Set(item.evidenceRefs).size, item.evidenceRefs.length);
  assert.equal(item.confidence, "NOT_ESTABLISHED");
  assert.equal(item.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(item.opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(item.monetaryValue, null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reviews), true);
  assert.equal(Object.isFrozen(item), true);
  assert.equal(Object.isFrozen(item.evidenceRefs), true);
  assert.deepEqual(result.authority, {
    analysisOnly: true,
    introPreparationAllowedOnlyForConfirmedReview: true,
    relationshipMutationAuthorized: false,
    crmMutationAuthorized: false,
    contactDiscoveryAuthorized: false,
    outreachAuthorized: false,
    externalActionAuthorized: false
  });
});
