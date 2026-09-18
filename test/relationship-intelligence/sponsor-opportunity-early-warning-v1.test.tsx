import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSponsorOpportunityEarlyWarningV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-early-warning-v1";
import type {
  SponsorOpportunityReadinessDecisionV1,
  SponsorOpportunityReadinessResultV1,
  SponsorOpportunityReadinessStatusV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";
import type {
  RelationshipSignalDeltaDecisionV1,
  RelationshipSignalDeltaResultV1
} from "@/lib/relationship-intelligence/relationship-signal-delta-v1";

const GENERATED_AT = "2026-09-18T17:00:00.000Z";
const EVALUATED_AT = "2026-09-18T17:20:00.000Z";

function knownField<T>(value: T, evidenceRef: string) {
  return { state: "KNOWN" as const, value, evidenceRefs: [evidenceRef] };
}

function readinessDecision(
  status: SponsorOpportunityReadinessStatusV1 = "READY_TO_PREPARE",
  overrides: Partial<SponsorOpportunityReadinessDecisionV1> = {}
): SponsorOpportunityReadinessDecisionV1 {
  return {
    candidateId: "sponsor:nike:uw",
    status,
    canonicalOrganizationRef: "org:nike",
    canonicalPersonRef: "person:nike-buyer",
    ecosystemRole: knownField("SPONSOR_SIDE", "ev:ecosystem"),
    decisionFunction: knownField("SPORTS_MARKETING", "ev:function"),
    authorityClass: knownField("DECISION_MAKER", "ev:authority"),
    accessStatus: "ACCESS_READY",
    planningDisposition: "WINDOW_OPEN",
    roleDisposition: "CURRENT_ROLE_SUPPORTED",
    idealOutreachDateRange: {
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-10-15T00:00:00.000Z"
    },
    timingRationale: "Evidence-backed sponsor planning window is open.",
    nextInternalAction: "PREPARE_APPROVAL_READY_OUTREACH",
    evidenceRefs: ["ev:access", "ev:role", "ev:timing"],
    gaps: [],
    reasonCodes: ["CURRENT_DECISION_MAKER_ROLE_CONFIRMED"],
    ...overrides
  };
}

function readiness(
  decision: SponsorOpportunityReadinessDecisionV1 = readinessDecision(),
  overrides: Partial<SponsorOpportunityReadinessResultV1> = {}
): SponsorOpportunityReadinessResultV1 {
  const counts: Record<SponsorOpportunityReadinessStatusV1, number> = {
    READY_TO_PREPARE: 0,
    PLAN_AHEAD: 0,
    ACCESS_BLOCKED: 0,
    MISSED_WINDOW: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
  counts[decision.status] = 1;

  return {
    version: "SPONSOR_OPPORTUNITY_READINESS_V1",
    generatedAt: GENERATED_AT,
    status: "READY",
    issues: [],
    decisions: [decision],
    counts,
    limitations: [],
    authority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    },
    ...overrides
  };
}

function signalDecision(
  overrides: Partial<RelationshipSignalDeltaDecisionV1> = {}
): RelationshipSignalDeltaDecisionV1 {
  return {
    deltaId: "delta:role-change",
    idempotencyKey: "signal:event:role-change",
    signalId: "signal:role-change",
    sourceEventKey: "event:role-change",
    sourceRef: "source:boardroom:role-change",
    observedAt: "2026-09-18T16:50:00.000Z",
    signalType: "EXECUTIVE_ROLE_CHANGE",
    truthState: "KNOWN",
    subjectEntityRef: "person:nike-buyer",
    objectEntityRef: "org:nike",
    relationshipKind: "EMPLOYED_BY",
    relationshipStatus: "ACTIVE",
    evidenceRefs: ["ev:role-change"],
    disposition: "UPDATE_RELATIONSHIP_CANDIDATE",
    changeClass: "ADD_RELATIONSHIP",
    matchedRelationshipRef: "relationship:nike-buyer:nike",
    matchedRelationshipEvidenceRefs: ["ev:old-role"],
    reasonCodes: ["RELATIONSHIP_STATUS_CHANGED"],
    safeNextStep: "REVIEW_RELATIONSHIP_CHANGE",
    ...overrides
  };
}

function relationshipSignals(
  decisions: readonly RelationshipSignalDeltaDecisionV1[] = [],
  overrides: Partial<RelationshipSignalDeltaResultV1> = {}
): RelationshipSignalDeltaResultV1 {
  return {
    version: "RELATIONSHIP_SIGNAL_DELTA_V1",
    generatedAt: GENERATED_AT,
    decisions,
    counts: {
      reviewed: decisions.length,
      newRelationshipCandidates: decisions.filter((item) => item.disposition === "NEW_RELATIONSHIP_CANDIDATE").length,
      updateRelationshipCandidates: decisions.filter((item) => item.disposition === "UPDATE_RELATIONSHIP_CANDIDATE").length,
      noMaterialChange: decisions.filter((item) => item.disposition === "NO_MATERIAL_CHANGE").length,
      needsVerification: decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length,
      suppressed: decisions.filter((item) => item.disposition === "SUPPRESS").length
    },
    matchingPolicy: "EXACT_CANONICAL_DIRECTION_AND_RELATIONSHIP_KIND_ONLY",
    relationshipKindInferencePerformed: false,
    opportunityInferencePerformed: false,
    graphMutationPerformed: false,
    crmMutationPerformed: false,
    externalActionPerformed: false,
    ...overrides
  };
}

test("surfaces an evidence-ready sponsor in the open planning window without authorizing outreach", () => {
  const result = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    relationshipSignals: relationshipSignals()
  });

  assert.equal(result.status, "READY");
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].attentionClass, "PREPARE_NOW");
  assert.equal(result.alerts[0].nextInternalAction, "PREPARE_APPROVAL_READY_OUTREACH");
  assert.equal(result.alerts[0].sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.alerts[0].budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(result.alerts[0].dealLikelihood, "NOT_ESTABLISHED");
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.spendAuthorized, false);
});

test("exact decision-maker role-change evidence fails closed to verification before preparation", () => {
  const result = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    relationshipSignals: relationshipSignals([signalDecision()])
  });

  assert.equal(result.alerts[0].readinessStatus, "READY_TO_PREPARE");
  assert.equal(result.alerts[0].attentionClass, "VERIFY_BEFORE_ACTION");
  assert.equal(result.alerts[0].nextInternalAction, "VERIFY_DECISION_MAKER_ROLE_CHANGE");
  assert.equal(result.alerts[0].contextSignals.length, 1);
  assert.equal(result.alerts[0].contextSignals[0].anchorMatch, "ORGANIZATION_AND_PERSON");
  assert.equal(result.alerts[0].contextSignals[0].opportunityImpact, "NOT_ESTABLISHED");
  assert.ok(result.alerts[0].evidenceRefs.includes("ev:role-change"));
  assert.ok(result.alerts[0].reasonCodes.includes("EXACT_DECISION_MAKER_ROLE_CHANGE_SIGNAL_REQUIRES_REVALIDATION"));
});

test("organization-only sponsorship change is review context and never upgrades or fabricates opportunity impact", () => {
  const signal = signalDecision({
    deltaId: "delta:sponsorship-end",
    signalId: "signal:sponsorship-end",
    sourceEventKey: "event:sponsorship-end",
    signalType: "SPONSORSHIP_END",
    subjectEntityRef: "org:nike",
    objectEntityRef: "org:league",
    relationshipKind: "SPONSOR_OF",
    relationshipStatus: "ENDED",
    evidenceRefs: ["ev:sponsorship-end"]
  });

  const result = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    relationshipSignals: relationshipSignals([signal])
  });

  assert.equal(result.alerts[0].attentionClass, "PREPARE_NOW");
  assert.equal(result.alerts[0].contextSignals[0].contextClass, "SPONSORSHIP_CHANGE");
  assert.equal(result.alerts[0].contextSignals[0].anchorMatch, "ORGANIZATION");
  assert.equal(result.alerts[0].opportunityImpactFromContextSignals, "NOT_ESTABLISHED");
  assert.equal(result.alerts[0].sponsorInterest, "NOT_ESTABLISHED");
});

test("ignores unrelated, no-change, and suppressed signals rather than joining them speculatively", () => {
  const unrelated = signalDecision({
    deltaId: "delta:unrelated",
    signalId: "signal:unrelated",
    subjectEntityRef: "person:someone-else",
    objectEntityRef: "org:adidas"
  });
  const noChange = signalDecision({
    deltaId: "delta:no-change",
    signalId: "signal:no-change",
    disposition: "NO_MATERIAL_CHANGE",
    changeClass: "NONE"
  });
  const suppressed = signalDecision({
    deltaId: "delta:suppressed",
    signalId: "signal:suppressed",
    disposition: "SUPPRESS",
    changeClass: "NONE"
  });

  const result = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    relationshipSignals: relationshipSignals([unrelated, noChange, suppressed])
  });

  assert.equal(result.alerts[0].contextSignals.length, 0);
  assert.equal(result.alerts[0].attentionClass, "PREPARE_NOW");
});

test("does not treat similar-looking canonical refs as the same sponsor or person", () => {
  const signal = signalDecision({
    deltaId: "delta:near-match",
    signalId: "signal:near-match",
    subjectEntityRef: "person:nike-buyer-former",
    objectEntityRef: "org:nike-emea"
  });

  const result = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    relationshipSignals: relationshipSignals([signal])
  });

  assert.equal(result.alerts[0].contextSignals.length, 0);
  assert.equal(result.matchingPolicy, "EXACT_CANONICAL_SPONSOR_OR_PERSON_ANCHOR_ONLY");
});

test("preserves plan-ahead, access-blocked, missed-window, research, and verification states without inventing certainty", () => {
  const cases: Array<[SponsorOpportunityReadinessStatusV1, string, string]> = [
    ["PLAN_AHEAD", "PLAN_AHEAD", "PREPARE_EARLY_ACTIVATION_BRIEF"],
    ["ACCESS_BLOCKED", "RESOLVE_ACCESS", "RESOLVE_ACCESS_BLOCKER"],
    ["MISSED_WINDOW", "RECOVER_NEXT_CYCLE", "RESEARCH_NEXT_CYCLE"],
    ["RESEARCH_REQUIRED", "RESEARCH_GAPS", "RESEARCH_EVIDENCE_GAPS"],
    ["VERIFY_REQUIRED", "VERIFY_BEFORE_ACTION", "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING"]
  ];

  for (const [status, attentionClass, action] of cases) {
    const result = buildSponsorOpportunityEarlyWarningV1({
      evaluatedAt: EVALUATED_AT,
      readiness: readiness(readinessDecision(status)),
      relationshipSignals: relationshipSignals()
    });
    assert.equal(result.alerts[0].attentionClass, attentionClass);
    assert.equal(result.alerts[0].nextInternalAction, action);
    assert.equal(result.alerts[0].dealLikelihood, "NOT_ESTABLISHED");
  }
});

test("suppressed sponsor-readiness candidates do not become radar alerts", () => {
  const result = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(readinessDecision("SUPPRESS")),
    relationshipSignals: relationshipSignals([signalDecision()])
  });

  assert.equal(result.alerts.length, 0);
  assert.equal(Object.values(result.counts).reduce((sum, count) => sum + count, 0), 0);
});

test("blocks the radar when an upstream projection is stale, future-dated, or already blocked", () => {
  const stale = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: "2026-09-18T19:30:00.000Z",
    readiness: readiness(),
    relationshipSignals: relationshipSignals(),
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.equal(stale.alerts.length, 0);
  assert.ok(stale.issues.includes("SPONSOR_READINESS_PROJECTION_STALE"));
  assert.ok(stale.issues.includes("RELATIONSHIP_SIGNALS_PROJECTION_STALE"));

  const future = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    relationshipSignals: relationshipSignals([], { generatedAt: "2026-09-18T18:00:00.000Z" })
  });
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.includes("RELATIONSHIP_SIGNALS_GENERATED_IN_FUTURE"));

  const blocked = buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(readinessDecision(), {
      status: "BLOCKED",
      issues: ["SPONSOR_ACCESS_PROJECTION_STALE"],
      decisions: []
    }),
    relationshipSignals: relationshipSignals()
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.issues.includes("SPONSOR_READINESS_BLOCKED"));
  assert.ok(blocked.issues.includes("SPONSOR_READINESS:SPONSOR_ACCESS_PROJECTION_STALE"));
});

test("rejects duplicate upstream identities instead of double-counting alerts or evidence", () => {
  assert.throws(() => buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(readinessDecision(), {
      decisions: [readinessDecision(), readinessDecision()]
    }),
    relationshipSignals: relationshipSignals()
  }), /duplicate candidateId/);

  const duplicateSignal = signalDecision();
  assert.throws(() => buildSponsorOpportunityEarlyWarningV1({
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    relationshipSignals: relationshipSignals([duplicateSignal, { ...duplicateSignal }])
  }), /duplicate deltaId/);
});
