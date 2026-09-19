import assert from "node:assert/strict";
import test from "node:test";

import {
  prioritizeSponsorPlanningAccessV1,
  type SponsorPlanningAccessPriorityInputV1
} from "../../src/lib/relationship-intelligence/sponsor-planning-access-priority-v1";
import {
  SPONSOR_ACCESS_BRIEF_VERSION_V1,
  type SponsorAccessBriefResultV1,
  type SponsorAccessBriefStatusV1
} from "../../src/lib/relationship-intelligence/sponsor-access-brief-v1";
import {
  EARLY_PLANNING_WINDOW_V1_VERSION,
  type EarlyPlanningDispositionV1,
  type EarlyPlanningWindowResultV1
} from "../../src/lib/relationship-intelligence/early-planning-window-v1";

const NOW = "2026-09-19T20:00:00.000Z";

const ACCESS_ACTION_BY_STATUS: Record<SponsorAccessBriefStatusV1, string> = {
  ACCESS_READY: "PREPARE_INTRO_BRIEF",
  PATH_BLOCKED: "RESOLVE_PATH_BLOCKER",
  NO_SUPPORTED_PATH: "RESEARCH_ACCESS_PATH",
  RESEARCH_REQUIRED: "RESEARCH_MISSING_SPONSOR_OR_ACCESS_EVIDENCE",
  VERIFY_REQUIRED: "VERIFY_CONFLICTED_OR_UNPROVEN_EVIDENCE",
  SUPPRESS: "NONE"
};

function accessBrief(
  candidateId: string,
  status: SponsorAccessBriefStatusV1 = "ACCESS_READY",
  overrides: Record<string, unknown> = {}
) {
  return {
    candidateId,
    status,
    canonicalOrganizationRef: `org:${candidateId}`,
    canonicalPersonRef: `person:${candidateId}`,
    targetEntityId: `entity:${candidateId}`,
    ecosystemRole: {},
    decisionFunction: {},
    authorityClass: {},
    sponsorAccessPath: {},
    contactRoute: {},
    planningWindow: {},
    eventOrSeasonDate: null,
    relationshipPath: null,
    evidenceRefs: [`evidence:access:${candidateId}`],
    researchOrVerificationGaps: status === "ACCESS_READY" ? [] : [`gap:${status}`],
    nextInternalAction: ACCESS_ACTION_BY_STATUS[status],
    reasonCodes: [`reason:access:${status}`],
    ...overrides
  };
}

function accessSource(
  briefs: readonly ReturnType<typeof accessBrief>[],
  overrides: Record<string, unknown> = {}
): SponsorAccessBriefResultV1 {
  const counts = {
    ACCESS_READY: briefs.filter((item) => item.status === "ACCESS_READY").length,
    PATH_BLOCKED: briefs.filter((item) => item.status === "PATH_BLOCKED").length,
    NO_SUPPORTED_PATH: briefs.filter((item) => item.status === "NO_SUPPORTED_PATH").length,
    RESEARCH_REQUIRED: briefs.filter((item) => item.status === "RESEARCH_REQUIRED").length,
    VERIFY_REQUIRED: briefs.filter((item) => item.status === "VERIFY_REQUIRED").length,
    SUPPRESS: briefs.filter((item) => item.status === "SUPPRESS").length
  };
  return {
    version: SPONSOR_ACCESS_BRIEF_VERSION_V1,
    generatedAt: "2026-09-19T19:55:00.000Z",
    sourceEntityId: "person:keegan",
    briefs,
    counts,
    actionAuthority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    },
    ...overrides
  } as unknown as SponsorAccessBriefResultV1;
}

function planningDecision(
  candidateId: string,
  disposition: EarlyPlanningDispositionV1 = "PLAN_AHEAD",
  overrides: Record<string, unknown> = {}
) {
  return {
    candidateId,
    canonicalOrganizationRef: `org:${candidateId}`,
    canonicalOpportunityRef: `opportunity:${candidateId}`,
    disposition,
    derivation: "EXPLICIT_PLANNING_WINDOW",
    idealOutreachDateRange: {
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2026-11-30T23:59:59.000Z"
    },
    activationDateRange: null,
    productionStartDateRange: null,
    whyThisWindow: "Evidence-backed planning range.",
    coverageGaps: [],
    reasonCodes: [`reason:planning:${disposition}`],
    safeNextStep: "MONITOR_AND_PREPARE_INTERNAL_BRIEF",
    observedAt: "2026-09-19T19:45:00.000Z",
    evidenceRefs: [`evidence:planning:${candidateId}`],
    ...overrides
  };
}

function planningSource(
  decisions: readonly ReturnType<typeof planningDecision>[],
  overrides: Record<string, unknown> = {}
): EarlyPlanningWindowResultV1 {
  const counts = {
    reviewed: decisions.length,
    planAhead: decisions.filter((item) => item.disposition === "PLAN_AHEAD").length,
    windowOpen: decisions.filter((item) => item.disposition === "WINDOW_OPEN").length,
    missedPlanningWindow: decisions.filter((item) => item.disposition === "MISSED_PLANNING_WINDOW").length,
    needsResearch: decisions.filter((item) => item.disposition === "NEEDS_RESEARCH").length,
    needsVerification: decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length,
    suppressed: decisions.filter((item) => item.disposition === "SUPPRESS").length
  };
  return {
    version: EARLY_PLANNING_WINDOW_V1_VERSION,
    generatedAt: "2026-09-19T19:56:00.000Z",
    decisions,
    counts,
    externalResearchPerformed: false,
    crmMutationPerformed: false,
    outreachPerformed: false,
    externalActionAuthorized: false,
    ...overrides
  } as unknown as EarlyPlanningWindowResultV1;
}

function input(
  accessBriefs: SponsorAccessBriefResultV1,
  planningWindows: EarlyPlanningWindowResultV1,
  overrides: Partial<SponsorPlanningAccessPriorityInputV1> = {}
): SponsorPlanningAccessPriorityInputV1 {
  return {
    accessBriefs,
    planningWindows,
    evaluatedAt: NOW,
    maximumProjectionAgeMinutes: 60,
    ...overrides
  };
}

test("surfaces an open planning window with supported access as internal ACT_NOW preparation only", () => {
  const result = prioritizeSponsorPlanningAccessV1(input(
    accessSource([accessBrief("uw", "ACCESS_READY")]),
    planningSource([planningDecision("uw", "WINDOW_OPEN", {
      idealOutreachDateRange: {
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-10-15T23:59:59.000Z"
      }
    })])
  ));

  assert.equal(result.status, "READY");
  assert.equal(result.items[0].priorityBand, "ACT_NOW");
  assert.equal(result.items[0].nextInternalAction, "PREPARE_APPROVAL_READY_INTRO");
  assert.equal(result.items[0].daysUntilWindowStart, 0);
  assert.equal(result.items[0].outreachAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("front-loads access-path work before an upcoming evidenced sponsor window", () => {
  const result = prioritizeSponsorPlanningAccessV1(input(
    accessSource([
      accessBrief("brand-a", "NO_SUPPORTED_PATH"),
      accessBrief("brand-b", "ACCESS_READY")
    ]),
    planningSource([
      planningDecision("brand-a", "PLAN_AHEAD"),
      planningDecision("brand-b", "PLAN_AHEAD", {
        idealOutreachDateRange: {
          startDate: "2027-03-01T00:00:00.000Z",
          endDate: "2027-04-30T23:59:59.000Z"
        }
      })
    ])
  ));

  assert.deepEqual(result.items.map((item) => item.candidateId), ["brand-a", "brand-b"]);
  assert.equal(result.items[0].priorityBand, "BUILD_ACCESS_NOW");
  assert.equal(result.items[0].nextInternalAction, "BUILD_ACCESS_PATH_BEFORE_WINDOW");
  assert.equal(result.items[1].priorityBand, "PREPARE_AHEAD");
});

test("routes blocked, unproven, or missing timing/access evidence to safe internal work instead of outreach", () => {
  const result = prioritizeSponsorPlanningAccessV1(input(
    accessSource([
      accessBrief("blocked", "PATH_BLOCKED"),
      accessBrief("verify", "VERIFY_REQUIRED"),
      accessBrief("timing", "ACCESS_READY")
    ]),
    planningSource([
      planningDecision("blocked", "WINDOW_OPEN"),
      planningDecision("verify", "PLAN_AHEAD"),
      planningDecision("timing", "NEEDS_RESEARCH", {
        idealOutreachDateRange: null,
        derivation: null,
        coverageGaps: ["PLANNING_WINDOW_UNKNOWN"]
      })
    ])
  ));

  const byId = new Map(result.items.map((item) => [item.candidateId, item]));
  assert.equal(byId.get("blocked")?.priorityBand, "BUILD_ACCESS_NOW");
  assert.equal(byId.get("blocked")?.nextInternalAction, "RESOLVE_ACCESS_BLOCKER_NOW");
  assert.equal(byId.get("verify")?.priorityBand, "VERIFY_NOW");
  assert.equal(byId.get("timing")?.priorityBand, "RESEARCH_NOW");
  assert.ok(byId.get("timing")?.researchOrVerificationGaps.includes("PLANNING_WINDOW_UNKNOWN"));
});

test("keeps missing cross-source coverage visible instead of silently dropping candidates", () => {
  const result = prioritizeSponsorPlanningAccessV1(input(
    accessSource([accessBrief("access-only")]),
    planningSource([planningDecision("planning-only")])
  ));

  assert.equal(result.items.length, 2);
  assert.equal(result.items.every((item) => item.priorityBand === "INCOMPLETE_EVIDENCE"), true);
  assert.equal(
    result.items.find((item) => item.candidateId === "access-only")?.nextInternalAction,
    "BUILD_MISSING_PLANNING_EVIDENCE"
  );
  assert.equal(
    result.items.find((item) => item.candidateId === "planning-only")?.nextInternalAction,
    "BUILD_MISSING_ACCESS_BRIEF"
  );
});

test("sends missed windows to next-cycle review without inventing a replacement date", () => {
  const result = prioritizeSponsorPlanningAccessV1(input(
    accessSource([accessBrief("missed")]),
    planningSource([planningDecision("missed", "MISSED_PLANNING_WINDOW", {
      idealOutreachDateRange: {
        startDate: "2026-05-01T00:00:00.000Z",
        endDate: "2026-07-31T23:59:59.000Z"
      }
    })])
  ));

  assert.equal(result.items[0].priorityBand, "NEXT_CYCLE_REVIEW");
  assert.equal(result.items[0].nextInternalAction, "REVIEW_NEXT_CYCLE");
  assert.equal(result.items[0].daysUntilWindowStart, 0);
});

test("fails closed when canonical organization identity disagrees across source artifacts", () => {
  const result = prioritizeSponsorPlanningAccessV1(input(
    accessSource([accessBrief("conflict", "ACCESS_READY", { canonicalOrganizationRef: "org:a" })]),
    planningSource([planningDecision("conflict", "PLAN_AHEAD", { canonicalOrganizationRef: "org:b" })])
  ));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.items.length, 0);
  assert.ok(result.issues.includes("CANDIDATE_CANONICAL_ORGANIZATION_MISMATCH:conflict"));
});

test("fails closed on stale, future, count-drift, unsafe-provenance, or widened-authority source truth", () => {
  const goodAccess = accessSource([accessBrief("a")]);
  const goodPlanning = planningSource([planningDecision("a")]);

  assert.equal(prioritizeSponsorPlanningAccessV1(input(
    accessSource([accessBrief("a")], { generatedAt: "2026-09-19T18:00:00.000Z" }),
    goodPlanning
  )).status, "BLOCKED");

  assert.equal(prioritizeSponsorPlanningAccessV1(input(
    goodAccess,
    planningSource([planningDecision("a")], { generatedAt: "2026-09-19T20:01:00.000Z" })
  )).status, "BLOCKED");

  assert.equal(prioritizeSponsorPlanningAccessV1(input(
    accessSource([accessBrief("a")], { counts: { ACCESS_READY: 0 } }),
    goodPlanning
  )).status, "BLOCKED");

  assert.equal(prioritizeSponsorPlanningAccessV1(input(
    accessSource([accessBrief("a", "ACCESS_READY", { evidenceRefs: ["op://vault/item/field"] })]),
    goodPlanning
  )).status, "BLOCKED");

  assert.equal(prioritizeSponsorPlanningAccessV1(input(
    goodAccess,
    planningSource([planningDecision("a")], { outreachPerformed: true })
  )).status, "BLOCKED");
});

test("suppresses source-suppressed candidates and enforces deterministic caps, sorting, immutability, and zero action authority", () => {
  const access = accessSource([
    accessBrief("suppressed", "SUPPRESS"),
    accessBrief("b", "ACCESS_READY"),
    accessBrief("a", "ACCESS_READY")
  ]);
  const planning = planningSource([
    planningDecision("suppressed", "PLAN_AHEAD"),
    planningDecision("b", "PLAN_AHEAD", {
      idealOutreachDateRange: { startDate: "2026-10-10T00:00:00.000Z", endDate: "2026-11-01T00:00:00.000Z" }
    }),
    planningDecision("a", "PLAN_AHEAD", {
      idealOutreachDateRange: { startDate: "2026-10-05T00:00:00.000Z", endDate: "2026-11-01T00:00:00.000Z" }
    })
  ]);

  const first = prioritizeSponsorPlanningAccessV1(input(access, planning, { maximumItems: 1 }));
  const second = prioritizeSponsorPlanningAccessV1(input(access, planning, { maximumItems: 1 }));

  assert.deepEqual(first, second);
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].candidateId, "a");
  assert.equal(first.omittedItemCount, 1);
  assert.equal(first.items.some((item) => item.candidateId === "suppressed"), false);
  assert.equal(first.authority.crmMutationAuthorized, false);
  assert.equal(first.authority.outreachAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);
  assert.equal(Object.isFrozen(first.items[0]), true);
});
