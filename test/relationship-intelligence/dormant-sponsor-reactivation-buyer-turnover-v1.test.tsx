import assert from "node:assert/strict";
import test from "node:test";

import { projectDormantEmailOpportunitiesV1 } from "@/lib/relationship-intelligence/dormant-email-opportunity-projector-v1";
import { compileDormantOpportunityHandoffsV1 } from "@/lib/relationship-intelligence/dormant-opportunity-handoff-v1";
import { buildDormantSponsorReactivationV1 } from "@/lib/relationship-intelligence/dormant-sponsor-reactivation-v1";
import type { SponsorOpportunityReadinessResultV1 } from "@/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";

test("organization-backed reactivation can use a newly evidenced current buyer without pretending the historical contact is still the decision maker", () => {
  const projection = projectDormantEmailOpportunitiesV1({
    now: "2026-09-18T15:00:00.000Z",
    minimumDormantDays: 14,
    activities: [{
      activityId: "email:legacy-buyer:1",
      conversationKey: "thread:legacy-sponsor",
      occurredAt: "2026-06-01T12:00:00.000Z",
      sourceRef: "ionos:keegan:thread:legacy-sponsor",
      evidenceRefs: ["ev:historical-sponsorship"],
      truthState: "KNOWN",
      threadState: "OPEN",
      businessSignal: "SPONSORSHIP",
      direction: "INBOUND",
      personRef: "person:historical-buyer",
      organizationRef: "org:sponsor",
      opportunityRef: "opportunity:historical-sponsor",
      explicitNextStep: "Reconnect before the next planning cycle.",
      nextStepState: "OPEN"
    }]
  });
  const dormant = projection.queue[0];
  const handoff = compileDormantOpportunityHandoffsV1({
    projection,
    contexts: [{
      candidateId: dormant.candidateId,
      sourceInteractionRef: "ionos:keegan:thread:legacy-sponsor",
      title: "Historical sponsor activation",
      titleTruthState: "KNOWN",
      titleEvidenceRefs: ["ev:historical-title"]
    }]
  });

  const sponsorReadiness: SponsorOpportunityReadinessResultV1 = {
    version: "SPONSOR_OPPORTUNITY_READINESS_V1",
    generatedAt: "2026-09-18T15:05:00.000Z",
    status: "READY",
    issues: [],
    decisions: [{
      candidateId: "sponsor:current",
      status: "READY_TO_PREPARE",
      canonicalOrganizationRef: "org:sponsor",
      canonicalPersonRef: "person:new-current-buyer",
      ecosystemRole: { state: "KNOWN", value: "SPONSOR_SIDE", evidenceRefs: ["ev:sponsor-role"] },
      decisionFunction: { state: "KNOWN", value: "SPORTS_MARKETING", evidenceRefs: ["ev:current-function"] },
      authorityClass: { state: "KNOWN", value: "DECISION_MAKER", evidenceRefs: ["ev:current-authority"] },
      accessStatus: "ACCESS_READY",
      planningDisposition: "WINDOW_OPEN",
      roleDisposition: "CURRENT_ROLE_SUPPORTED",
      idealOutreachDateRange: {
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-10-15T00:00:00.000Z"
      },
      timingRationale: "The current evidence-backed planning window is open.",
      nextInternalAction: "PREPARE_APPROVAL_READY_OUTREACH",
      evidenceRefs: ["ev:current-buyer", "ev:current-path", "ev:current-window"],
      gaps: [],
      reasonCodes: ["CURRENT_BUYER_ROLE_ACCESS_AND_TIMING_SUPPORTED"]
    }],
    counts: {
      READY_TO_PREPARE: 1,
      PLAN_AHEAD: 0,
      ACCESS_BLOCKED: 0,
      MISSED_WINDOW: 0,
      RESEARCH_REQUIRED: 0,
      VERIFY_REQUIRED: 0,
      SUPPRESS: 0
    },
    limitations: ["Current readiness does not prove sponsor willingness."],
    authority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    }
  };

  const result = buildDormantSponsorReactivationV1({
    evaluatedAt: "2026-09-18T15:20:00.000Z",
    dormantProjection: projection,
    dormantHandoff: handoff,
    sponsorReadiness,
    mappings: [{
      dormantCandidateId: dormant.candidateId,
      sponsorCandidateId: "sponsor:current",
      linkBasis: "SAME_CANONICAL_ORGANIZATION",
      truthState: "KNOWN",
      evidenceRefs: ["ev:organization-link"]
    }]
  });

  assert.equal(result.decisions[0].disposition, "READY_FOR_INTERNAL_REACTIVATION_PREP");
  assert.equal(result.decisions[0].canonicalPersonRef, "person:historical-buyer");
  assert.ok(result.decisions[0].reasonCodes.includes("CURRENT_DECISION_MAKER_DIFFERS_FROM_HISTORICAL_CONTACT"));
  assert.equal(result.decisions[0].currentSponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
});
