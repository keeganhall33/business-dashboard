import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSponsorOpportunityReadinessV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";
import type {
  DecisionMakerRoleFreshnessResultV1,
  DecisionMakerRoleProjectionV1
} from "@/lib/relationship-intelligence/decision-maker-role-freshness-v1";
import type {
  EarlyPlanningDecisionV1,
  EarlyPlanningDispositionV1,
  EarlyPlanningWindowResultV1
} from "@/lib/relationship-intelligence/early-planning-window-v1";
import type {
  SponsorAccessBriefResultV1,
  SponsorAccessBriefStatusV1
} from "@/lib/relationship-intelligence/sponsor-access-brief-v1";

const GENERATED_AT = "2026-09-18T15:00:00.000Z";
const EVALUATED_AT = "2026-09-18T15:20:00.000Z";

function knownField<T>(value: T, evidenceRef: string) {
  return { state: "KNOWN" as const, value, evidenceRefs: [evidenceRef] };
}

function sponsorAccess(
  status: SponsorAccessBriefStatusV1 = "ACCESS_READY",
  overrides: Partial<SponsorAccessBriefResultV1["briefs"][number]> = {}
): SponsorAccessBriefResultV1 {
  return {
    version: "SPONSOR_ACCESS_BRIEF_V1",
    generatedAt: GENERATED_AT,
    sourceEntityId: "person:keegan",
    briefs: [{
      candidateId: "sponsor:nike:uw",
      status,
      canonicalOrganizationRef: "org:nike",
      canonicalPersonRef: "person:buyer",
      targetEntityId: "entity:buyer",
      ecosystemRole: knownField("SPONSOR_SIDE", "ev:sponsor-role"),
      decisionFunction: knownField("SPORTS_MARKETING", "ev:decision-function"),
      authorityClass: knownField("DECISION_MAKER", "ev:authority"),
      sponsorAccessPath: knownField("WARM", "ev:access"),
      contactRoute: knownField("PUBLIC_PROFESSIONAL", "ev:contact-route"),
      planningWindow: knownField("Fall 2026 planning", "ev:planning-text"),
      eventOrSeasonDate: null,
      relationshipPath: null,
      evidenceRefs: ["ev:access", "ev:authority", "ev:sponsor-role"],
      researchOrVerificationGaps: [],
      nextInternalAction: status === "ACCESS_READY" ? "PREPARE_INTRO_BRIEF" : "RESEARCH_ACCESS_PATH",
      reasonCodes: ["SPONSOR_DECISION_AUTHORITY_AND_CANONICAL_ACCESS_PATH_SUPPORTED"],
      ...overrides
    }],
    counts: {
      ACCESS_READY: status === "ACCESS_READY" ? 1 : 0,
      PATH_BLOCKED: status === "PATH_BLOCKED" ? 1 : 0,
      NO_SUPPORTED_PATH: status === "NO_SUPPORTED_PATH" ? 1 : 0,
      RESEARCH_REQUIRED: status === "RESEARCH_REQUIRED" ? 1 : 0,
      VERIFY_REQUIRED: status === "VERIFY_REQUIRED" ? 1 : 0,
      SUPPRESS: status === "SUPPRESS" ? 1 : 0
    },
    actionAuthority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    }
  };
}

function planningDecision(
  disposition: EarlyPlanningDispositionV1 = "WINDOW_OPEN",
  overrides: Partial<EarlyPlanningDecisionV1> = {}
): EarlyPlanningDecisionV1 {
  return {
    candidateId: "sponsor:nike:uw",
    canonicalOrganizationRef: "org:nike",
    canonicalOpportunityRef: "opportunity:uw-sponsor-activation",
    disposition,
    derivation: "EXPLICIT_PLANNING_WINDOW",
    idealOutreachDateRange: {
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-10-15T00:00:00.000Z"
    },
    activationDateRange: {
      startDate: "2027-08-01T00:00:00.000Z",
      endDate: "2027-09-01T00:00:00.000Z"
    },
    productionStartDateRange: {
      startDate: "2027-02-01T00:00:00.000Z",
      endDate: "2027-03-01T00:00:00.000Z"
    },
    whyThisWindow: "Evidence-backed planning range is open before the activation window.",
    coverageGaps: [],
    reasonCodes: ["EXPLICIT_PLANNING_WINDOW_SUPPORTED"],
    safeNextStep: disposition === "WINDOW_OPEN"
      ? "PREPARE_APPROVAL_READY_OUTREACH"
      : disposition === "PLAN_AHEAD"
        ? "MONITOR_AND_PREPARE_INTERNAL_BRIEF"
        : disposition === "MISSED_PLANNING_WINDOW"
          ? "REVIEW_MISSED_WINDOW_AND_FIND_NEXT_CYCLE"
          : disposition === "NEEDS_VERIFICATION"
            ? "VERIFY_TIMING_EVIDENCE"
            : disposition === "NEEDS_RESEARCH"
              ? "RESEARCH_PLANNING_WINDOW_OR_LEAD_TIME"
              : "RESOLVE_CANONICAL_ANCHOR_OR_EVIDENCE",
    observedAt: "2026-09-18T14:50:00.000Z",
    evidenceRefs: ["ev:timing"],
    ...overrides
  };
}

function planning(
  disposition: EarlyPlanningDispositionV1 = "WINDOW_OPEN",
  overrides: Partial<EarlyPlanningWindowResultV1> = {}
): EarlyPlanningWindowResultV1 {
  return {
    version: "EARLY_PLANNING_WINDOW_V1",
    generatedAt: GENERATED_AT,
    decisions: [planningDecision(disposition)],
    counts: {
      reviewed: 1,
      planAhead: disposition === "PLAN_AHEAD" ? 1 : 0,
      windowOpen: disposition === "WINDOW_OPEN" ? 1 : 0,
      missedPlanningWindow: disposition === "MISSED_PLANNING_WINDOW" ? 1 : 0,
      needsResearch: disposition === "NEEDS_RESEARCH" ? 1 : 0,
      needsVerification: disposition === "NEEDS_VERIFICATION" ? 1 : 0,
      suppressed: disposition === "SUPPRESS" ? 1 : 0
    },
    externalResearchPerformed: false,
    crmMutationPerformed: false,
    outreachPerformed: false,
    externalActionAuthorized: false,
    ...overrides
  };
}

function roleProjection(
  disposition: DecisionMakerRoleProjectionV1["disposition"] = "CURRENT_ROLE_SUPPORTED",
  overrides: Partial<DecisionMakerRoleProjectionV1> = {}
): DecisionMakerRoleProjectionV1 {
  const current = disposition === "CURRENT_ROLE_SUPPORTED";
  return {
    canonicalPersonRef: "person:buyer",
    disposition,
    currentObservationId: "role:buyer:2026-09",
    canonicalOrganizationRef: "org:nike",
    title: "VP Sports Marketing",
    decisionFunction: "SPORTS_MARKETING",
    authorityClass: "DECISION_MAKER",
    observedAt: "2026-09-17T18:00:00.000Z",
    supersededObservationIds: [],
    reasonCodes: current ? ["CURRENT_ROLE_AND_AUTHORITY_EVIDENCED"] : ["CURRENT_EMPLOYMENT_NOT_CONFIRMED"],
    evidenceRefs: ["ev:current-role"],
    authorityUsableForGraph: current,
    authorityRevalidationRequired: !current,
    relationshipEdgeInvalidated: false,
    ...overrides
  };
}

function roleFreshness(
  disposition: DecisionMakerRoleProjectionV1["disposition"] = "CURRENT_ROLE_SUPPORTED",
  overrides: Partial<DecisionMakerRoleFreshnessResultV1> = {}
): DecisionMakerRoleFreshnessResultV1 {
  return {
    version: "DECISION_MAKER_ROLE_FRESHNESS_V1",
    generatedAt: GENERATED_AT,
    roles: [roleProjection(disposition)],
    counts: {
      peopleReviewed: 1,
      currentSupported: disposition === "CURRENT_ROLE_SUPPORTED" ? 1 : 0,
      needsResearch: disposition === "CURRENT_ROLE_NEEDS_RESEARCH" ? 1 : 0,
      verifyRequired: disposition === "VERIFY_REQUIRED" ? 1 : 0,
      noCurrentRole: disposition === "NO_CURRENT_ROLE_SUPPORTED" ? 1 : 0,
      conflicted: disposition === "CONFLICTED" ? 1 : 0
    },
    externalResearchPerformed: false,
    crmMutationPerformed: false,
    relationshipMutationPerformed: false,
    externalActionPerformed: false,
    ...overrides
  };
}

test("combines supported sponsor access, current decision-maker role, and an open planning window into preparation only", () => {
  const result = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess(),
    planning: planning(),
    roleFreshness: roleFreshness()
  });

  assert.equal(result.status, "READY");
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].status, "READY_TO_PREPARE");
  assert.equal(result.decisions[0].nextInternalAction, "PREPARE_APPROVAL_READY_OUTREACH");
  assert.deepEqual(result.decisions[0].idealOutreachDateRange, {
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-10-15T00:00:00.000Z"
  });
  assert.ok(result.decisions[0].evidenceRefs.includes("ev:access"));
  assert.ok(result.decisions[0].evidenceRefs.includes("ev:current-role"));
  assert.ok(result.decisions[0].evidenceRefs.includes("ev:timing"));
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.match(result.limitations.join(" "), /do not prove willingness/i);
});

test("keeps an evidenced future planning window as plan-ahead internal preparation rather than immediate outreach", () => {
  const result = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess(),
    planning: planning("PLAN_AHEAD"),
    roleFreshness: roleFreshness()
  });

  assert.equal(result.decisions[0].status, "PLAN_AHEAD");
  assert.equal(result.decisions[0].nextInternalAction, "PREPARE_EARLY_ACTIVATION_BRIEF");
  assert.equal(result.authority.outreachAuthorized, false);
});

test("fails closed when current role evidence requires verification even when sponsor access and timing look ready", () => {
  const result = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess(),
    planning: planning(),
    roleFreshness: roleFreshness("VERIFY_REQUIRED")
  });

  assert.equal(result.decisions[0].status, "VERIFY_REQUIRED");
  assert.equal(result.decisions[0].nextInternalAction, "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING");
  assert.ok(result.decisions[0].gaps.includes("DECISION_MAKER_ROLE_NOT_SAFE_TO_USE"));
});

test("fails closed on sponsor-vs-current-role organization disagreement", () => {
  const result = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess(),
    planning: planning(),
    roleFreshness: roleFreshness("CURRENT_ROLE_SUPPORTED", {
      roles: [roleProjection("CURRENT_ROLE_SUPPORTED", { canonicalOrganizationRef: "org:other" })]
    })
  });

  assert.equal(result.decisions[0].status, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].gaps.includes("ROLE_ORGANIZATION_MISMATCH"));
});

test("does not convert a blocked warm path into timing urgency", () => {
  const result = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess("PATH_BLOCKED", {
      researchOrVerificationGaps: ["PATH_BLOCKER:INTRODUCER_WILLINGNESS_UNKNOWN"],
      nextInternalAction: "RESOLVE_PATH_BLOCKER"
    }),
    planning: planning(),
    roleFreshness: roleFreshness()
  });

  assert.equal(result.decisions[0].status, "ACCESS_BLOCKED");
  assert.equal(result.decisions[0].nextInternalAction, "RESOLVE_ACCESS_BLOCKER");
  assert.equal(result.authority.outreachAuthorized, false);
});

test("treats a missed planning window as learning for the next cycle, not a fabricated current opportunity", () => {
  const result = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess(),
    planning: planning("MISSED_PLANNING_WINDOW"),
    roleFreshness: roleFreshness()
  });

  assert.equal(result.decisions[0].status, "MISSED_WINDOW");
  assert.equal(result.decisions[0].nextInternalAction, "RESEARCH_NEXT_CYCLE");
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("requires matching planning identity rather than joining sponsor and timing records speculatively", () => {
  const result = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess(),
    planning: planning("WINDOW_OPEN", {
      decisions: [planningDecision("WINDOW_OPEN", { canonicalOrganizationRef: "org:adidas" })]
    }),
    roleFreshness: roleFreshness()
  });

  assert.equal(result.decisions[0].status, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].gaps.includes("PLANNING_ORGANIZATION_MISMATCH"));
});

test("blocks all readiness decisions when any upstream projection is stale or future-dated", () => {
  const stale = buildSponsorOpportunityReadinessV1({
    evaluatedAt: "2026-09-18T18:00:00.000Z",
    sponsorAccess: sponsorAccess(),
    planning: planning(),
    roleFreshness: roleFreshness(),
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.equal(stale.decisions.length, 0);
  assert.ok(stale.issues.includes("SPONSOR_ACCESS_PROJECTION_STALE"));

  const future = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: sponsorAccess(),
    planning: planning("WINDOW_OPEN", { generatedAt: "2026-09-18T16:00:00.000Z" }),
    roleFreshness: roleFreshness()
  });
  assert.equal(future.status, "BLOCKED");
  assert.equal(future.decisions.length, 0);
  assert.ok(future.issues.includes("EARLY_PLANNING_GENERATED_IN_FUTURE"));
});

test("is deterministic, deeply immutable, and leaves caller projections unfrozen and unchanged", () => {
  const access = sponsorAccess();
  const timing = planning();
  const roles = roleFreshness();
  const before = structuredClone({ access, timing, roles });

  assert.equal(Object.isFrozen(access.briefs[0].ecosystemRole), false);
  assert.equal(Object.isFrozen(timing.decisions[0].idealOutreachDateRange), false);

  const first = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: access,
    planning: timing,
    roleFreshness: roles
  });
  const second = buildSponsorOpportunityReadinessV1({
    evaluatedAt: EVALUATED_AT,
    sponsorAccess: access,
    planning: timing,
    roleFreshness: roles
  });

  assert.deepEqual(first, second);
  assert.deepEqual({ access, timing, roles }, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].ecosystemRole), true);
  assert.equal(Object.isFrozen(access.briefs[0].ecosystemRole), false);
  assert.equal(Object.isFrozen(timing.decisions[0].idealOutreachDateRange), false);
});
