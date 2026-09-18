import assert from "node:assert/strict";
import test from "node:test";

import {
  projectDormantEmailOpportunitiesV1,
  type DormantBusinessSignalV1
} from "@/lib/relationship-intelligence/dormant-email-opportunity-projector-v1";
import {
  compileDormantOpportunityHandoffsV1
} from "@/lib/relationship-intelligence/dormant-opportunity-handoff-v1";
import {
  buildDormantSponsorReactivationV1,
  type DormantSponsorMappingV1
} from "@/lib/relationship-intelligence/dormant-sponsor-reactivation-v1";
import type {
  SponsorOpportunityReadinessResultV1,
  SponsorOpportunityReadinessStatusV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";

const DORMANT_GENERATED_AT = "2026-09-18T15:00:00.000Z";
const SPONSOR_GENERATED_AT = "2026-09-18T15:05:00.000Z";
const EVALUATED_AT = "2026-09-18T15:20:00.000Z";

function dormantHistory(
  businessSignal: DormantBusinessSignalV1 = "SPONSORSHIP",
  overrides: Partial<Parameters<typeof projectDormantEmailOpportunitiesV1>[0]["activities"][number]> = {}
) {
  const projection = projectDormantEmailOpportunitiesV1({
    now: DORMANT_GENERATED_AT,
    minimumDormantDays: 14,
    activities: [{
      activityId: "email:thread:nike:1",
      conversationKey: "thread:nike",
      occurredAt: "2026-07-01T12:00:00.000Z",
      sourceRef: "ionos:keegan:thread:nike",
      evidenceRefs: ["ev:historical-thread"],
      truthState: "KNOWN",
      threadState: "OPEN",
      businessSignal,
      direction: "INBOUND",
      personRef: "person:buyer",
      organizationRef: "org:nike",
      opportunityRef: "opportunity:historic-nike",
      explicitNextStep: "Revisit the next sponsorship planning cycle.",
      nextStepState: "OPEN",
      ...overrides
    }]
  });
  assert.equal(projection.queue.length, 1);

  const candidate = projection.queue[0];
  const handoff = compileDormantOpportunityHandoffsV1({
    projection,
    contexts: [{
      candidateId: candidate.candidateId,
      sourceInteractionRef: "ionos:keegan:thread:nike",
      title: "Historical sponsor activation discussion",
      titleTruthState: "KNOWN",
      titleEvidenceRefs: ["ev:evidenced-title"]
    }]
  });

  return { projection, handoff, candidate };
}

function nextActionFor(status: SponsorOpportunityReadinessStatusV1) {
  switch (status) {
    case "READY_TO_PREPARE":
      return "PREPARE_APPROVAL_READY_OUTREACH" as const;
    case "PLAN_AHEAD":
      return "PREPARE_EARLY_ACTIVATION_BRIEF" as const;
    case "ACCESS_BLOCKED":
      return "RESOLVE_ACCESS_BLOCKER" as const;
    case "MISSED_WINDOW":
      return "RESEARCH_NEXT_CYCLE" as const;
    case "RESEARCH_REQUIRED":
      return "RESEARCH_EVIDENCE_GAPS" as const;
    case "VERIFY_REQUIRED":
      return "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING" as const;
    case "SUPPRESS":
      return "NONE" as const;
  }
}

function readiness(
  status: SponsorOpportunityReadinessStatusV1 = "READY_TO_PREPARE",
  overrides: Partial<SponsorOpportunityReadinessResultV1["decisions"][number]> = {},
  topLevel: Partial<SponsorOpportunityReadinessResultV1> = {}
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
  counts[status] = 1;

  return {
    version: "SPONSOR_OPPORTUNITY_READINESS_V1",
    generatedAt: SPONSOR_GENERATED_AT,
    status: "READY",
    issues: [],
    decisions: [{
      candidateId: "sponsor:nike:uw",
      status,
      canonicalOrganizationRef: "org:nike",
      canonicalPersonRef: "person:buyer",
      ecosystemRole: { state: "KNOWN", value: "SPONSOR_SIDE", evidenceRefs: ["ev:sponsor-role"] },
      decisionFunction: { state: "KNOWN", value: "SPORTS_MARKETING", evidenceRefs: ["ev:decision-function"] },
      authorityClass: { state: "KNOWN", value: "DECISION_MAKER", evidenceRefs: ["ev:authority"] },
      accessStatus: status === "ACCESS_BLOCKED" ? "PATH_BLOCKED" : "ACCESS_READY",
      planningDisposition: status === "PLAN_AHEAD"
        ? "PLAN_AHEAD"
        : status === "MISSED_WINDOW"
          ? "MISSED_PLANNING_WINDOW"
          : "WINDOW_OPEN",
      roleDisposition: "CURRENT_ROLE_SUPPORTED",
      idealOutreachDateRange: status === "MISSED_WINDOW" ? null : {
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-10-15T00:00:00.000Z"
      },
      timingRationale: "Evidence-backed sponsor planning range from the canonical timing projection.",
      nextInternalAction: nextActionFor(status),
      evidenceRefs: ["ev:current-path", "ev:current-role", "ev:current-timing"],
      gaps: status === "ACCESS_BLOCKED" ? ["PATH_BLOCKER:INTRODUCER_WILLINGNESS_UNKNOWN"] : [],
      reasonCodes: ["CURRENT_SPONSOR_ACCESS_ROLE_AND_TIMING_EVIDENCED"],
      ...overrides
    }],
    counts,
    limitations: ["Current readiness does not prove sponsor willingness, budget, or deal likelihood."],
    authority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    },
    ...topLevel
  };
}

function mapping(
  dormantCandidateId: string,
  overrides: Partial<DormantSponsorMappingV1> = {}
): DormantSponsorMappingV1 {
  return {
    dormantCandidateId,
    sponsorCandidateId: "sponsor:nike:uw",
    linkBasis: "SAME_CANONICAL_ORGANIZATION",
    truthState: "KNOWN",
    evidenceRefs: ["ev:explicit-dormant-sponsor-link"],
    ...overrides
  };
}

test("reactivates an evidenced historical sponsorship only into internal preparation when current access, role, and timing are ready", () => {
  const history = dormantHistory();
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness(),
    mappings: [mapping(history.candidate.candidateId)]
  });

  assert.equal(result.status, "READY");
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].disposition, "READY_FOR_INTERNAL_REACTIVATION_PREP");
  assert.equal(result.decisions[0].nextInternalAction, "PREPARE_REACTIVATION_BRIEF_FOR_KEEGAN_REVIEW");
  assert.equal(result.decisions[0].currentSponsorInterest, "NOT_ESTABLISHED");
  assert.deepEqual(result.decisions[0].idealOutreachDateRange, {
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-10-15T00:00:00.000Z"
  });
  assert.ok(result.decisions[0].evidenceRefs.includes("ev:historical-thread"));
  assert.ok(result.decisions[0].evidenceRefs.includes("ev:explicit-dormant-sponsor-link"));
  assert.ok(result.decisions[0].evidenceRefs.includes("ev:current-timing"));
  assert.equal(result.authority.canonicalOpportunityMutationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.match(result.limitations.join(" "), /not proof that sponsor interest/i);
});

test("refuses to join a dormant sponsorship to current readiness merely because the canonical organization happens to match", () => {
  const history = dormantHistory();
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness(),
    mappings: []
  });

  assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(result.decisions[0].gaps.includes("EXPLICIT_DORMANT_TO_SPONSOR_MAPPING_REQUIRED"));
  assert.ok(result.decisions[0].reasonCodes.includes("NO_SPECULATIVE_JOIN_FROM_ORGANIZATION_OR_NAME_MATCH"));
  assert.equal(result.decisions[0].sponsorCandidateId, null);
});

test("fails closed when an explicit mapping conflicts with the canonical sponsor organization", () => {
  const history = dormantHistory();
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness("READY_TO_PREPARE", { canonicalOrganizationRef: "org:adidas" }),
    mappings: [mapping(history.candidate.candidateId)]
  });

  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].gaps.includes("CANONICAL_ORGANIZATION_MISMATCH"));
  assert.equal(result.decisions[0].currentSponsorInterest, "NOT_ESTABLISHED");
});

test("preserves a future planning window as plan-ahead rather than converting historical interest into urgency", () => {
  const history = dormantHistory();
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness("PLAN_AHEAD", {
      idealOutreachDateRange: {
        startDate: "2026-12-01T00:00:00.000Z",
        endDate: "2027-01-31T00:00:00.000Z"
      }
    }),
    mappings: [mapping(history.candidate.candidateId)]
  });

  assert.equal(result.decisions[0].disposition, "PLAN_AHEAD");
  assert.equal(result.decisions[0].nextInternalAction, "PREPARE_EARLY_REACTIVATION_BRIEF");
  assert.equal(result.decisions[0].currentSponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.authority.outreachAuthorized, false);
});

test("keeps a currently blocked warm path blocked even when the historical sponsorship discussion is known", () => {
  const history = dormantHistory();
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness("ACCESS_BLOCKED"),
    mappings: [mapping(history.candidate.candidateId)]
  });

  assert.equal(result.decisions[0].disposition, "ACCESS_BLOCKED");
  assert.equal(result.decisions[0].nextInternalAction, "RESOLVE_CURRENT_ACCESS_BLOCKER");
  assert.ok(result.decisions[0].gaps.includes("SPONSOR_READINESS:PATH_BLOCKER:INTRODUCER_WILLINGNESS_UNKNOWN"));
});

test("turns a missed current planning window into next-cycle research, not a fabricated current opportunity", () => {
  const history = dormantHistory();
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness("MISSED_WINDOW"),
    mappings: [mapping(history.candidate.candidateId)]
  });

  assert.equal(result.decisions[0].disposition, "MISSED_WINDOW");
  assert.equal(result.decisions[0].nextInternalAction, "RESEARCH_NEXT_SUPPORTED_PLANNING_CYCLE");
  assert.equal(result.authority.outreachAuthorized, false);
});

test("ignores non-sponsorship dormant candidates instead of forcing them through a sponsor hypothesis", () => {
  const history = dormantHistory("MEDIA");
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness(),
    mappings: []
  });

  assert.equal(result.decisions[0].disposition, "NOT_APPLICABLE");
  assert.equal(result.decisions[0].sponsorCandidateId, null);
  assert.equal(result.decisions[0].currentSponsorInterest, "NOT_ESTABLISHED");
});

test("requires the dormant-to-current mapping itself to be current known evidence", () => {
  const history = dormantHistory();
  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness(),
    mappings: [mapping(history.candidate.candidateId, { truthState: "CONFLICTED" })]
  });

  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].gaps.includes("MAPPING_CONFLICTED"));
});

test("blocks the entire projection when historical or current readiness inputs are stale, future, or already blocked", () => {
  const history = dormantHistory();
  const stale = buildDormantSponsorReactivationV1({
    evaluatedAt: "2026-09-18T18:30:00.000Z",
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness(),
    mappings: [mapping(history.candidate.candidateId)],
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.equal(stale.decisions.length, 0);
  assert.ok(stale.issues.includes("DORMANT_PROJECTION_PROJECTION_STALE"));
  assert.ok(stale.issues.includes("SPONSOR_READINESS_PROJECTION_STALE"));

  const future = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness("READY_TO_PREPARE", {}, { generatedAt: "2026-09-18T16:00:00.000Z" }),
    mappings: [mapping(history.candidate.candidateId)]
  });
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.includes("SPONSOR_READINESS_GENERATED_IN_FUTURE"));

  const blocked = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: readiness("READY_TO_PREPARE", {}, { status: "BLOCKED", issues: ["CURRENT_ROLE_STALE"] }),
    mappings: [mapping(history.candidate.candidateId)]
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.issues.includes("SPONSOR_READINESS_BLOCKED"));
  assert.ok(blocked.issues.includes("SPONSOR_READINESS:CURRENT_ROLE_STALE"));
});

test("is deterministic, deeply immutable, and does not mutate canonical upstream projections", () => {
  const history = dormantHistory();
  const sponsor = readiness();
  const links = [mapping(history.candidate.candidateId)];
  const before = structuredClone({ projection: history.projection, handoff: history.handoff, sponsor, links });

  const first = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: sponsor,
    mappings: links
  });
  const second = buildDormantSponsorReactivationV1({
    evaluatedAt: EVALUATED_AT,
    dormantProjection: history.projection,
    dormantHandoff: history.handoff,
    sponsorReadiness: sponsor,
    mappings: links
  });

  assert.deepEqual(first, second);
  assert.deepEqual({ projection: history.projection, handoff: history.handoff, sponsor, links }, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].evidenceRefs), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
