import assert from "node:assert/strict";
import test from "node:test";

import { reviewSponsorDecisionMakerSidesV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-side-v1";
import { buildSponsorPlanningWindowReviewV1 } from "@/lib/opportunity-intelligence/sponsor-planning-window-review-v1";
import type { OpportunityAccessEvidenceV1 } from "@/lib/opportunity-intelligence/opportunity-access-map-v1";
import type { EarlyPlanningWindowResultV1 } from "@/lib/relationship-intelligence/early-planning-window-v1";

const OPPORTUNITY_ID = "opportunity:uw-sponsor-window";
const AS_OF = "2026-09-19T03:00:00.000Z";
const EVALUATED_AT = "2026-09-19T04:00:00.000Z";

function sideEvidence(input?: {
  sponsorOrganizationId?: string;
  sponsorLabel?: string;
}): readonly OpportunityAccessEvidenceV1[] {
  const sponsorOrganizationId = input?.sponsorOrganizationId ?? "organization:brand";
  const sponsorLabel = input?.sponsorLabel ?? "Brand";
  return [
    {
      evidenceId: "sponsor-buyer",
      opportunityId: OPPORTUNITY_ID,
      kind: "DECISION_MAKER",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-19T02:00:00.000Z",
      evidenceRefs: ["source:sponsor-buyer"],
      personCanonicalId: "person:sponsor-buyer",
      personLabel: "Sponsor Buyer",
      organizationCanonicalId: sponsorOrganizationId,
      organizationLabel: sponsorLabel,
      decisionClass: "PARTNERSHIPS",
    },
    {
      evidenceId: "property-buyer",
      opportunityId: OPPORTUNITY_ID,
      kind: "DECISION_MAKER",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-19T02:00:00.000Z",
      evidenceRefs: ["source:property-buyer"],
      personCanonicalId: "person:property-buyer",
      personLabel: "Property Buyer",
      organizationCanonicalId: "organization:property",
      organizationLabel: "Property",
      decisionClass: "PARTNERSHIPS",
    },
    {
      evidenceId: "sponsor-link",
      opportunityId: OPPORTUNITY_ID,
      kind: "SPONSORSHIP_LINK",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-19T02:05:00.000Z",
      evidenceRefs: ["source:sponsor-link"],
      propertyCanonicalId: "organization:property",
      propertyLabel: "Property",
      sponsorCanonicalId: sponsorOrganizationId,
      sponsorLabel,
      relationshipLabel: "OFFICIAL_SPONSOR",
    },
  ];
}

function planning(input?: {
  organizationRef?: string | null;
  opportunityRef?: string | null;
  generatedAt?: string;
}): EarlyPlanningWindowResultV1 {
  const organizationRef = input?.organizationRef === undefined ? "organization:brand" : input.organizationRef;
  const opportunityRef = input?.opportunityRef === undefined ? OPPORTUNITY_ID : input.opportunityRef;
  return {
    version: "EARLY_PLANNING_WINDOW_V1",
    generatedAt: input?.generatedAt ?? AS_OF,
    decisions: [
      {
        candidateId: "timing:brand-next-season",
        canonicalOrganizationRef: organizationRef,
        canonicalOpportunityRef: opportunityRef,
        disposition: "WINDOW_OPEN",
        derivation: "EXPLICIT_PLANNING_WINDOW",
        idealOutreachDateRange: {
          startDate: "2026-09-10T00:00:00.000Z",
          endDate: "2026-10-15T00:00:00.000Z",
        },
        activationDateRange: {
          startDate: "2027-08-01T00:00:00.000Z",
          endDate: "2027-09-15T00:00:00.000Z",
        },
        productionStartDateRange: null,
        whyThisWindow: "Direct planning evidence places the sponsor planning window in the current period.",
        coverageGaps: [],
        reasonCodes: ["EXPLICIT_PLANNING_WINDOW_CURRENT"],
        safeNextStep: "PREPARE_APPROVAL_READY_OUTREACH",
        observedAt: "2026-09-19T02:30:00.000Z",
        evidenceRefs: ["source:timing"],
      },
    ],
    counts: {
      reviewed: 1,
      planAhead: 0,
      windowOpen: 1,
      missedPlanningWindow: 0,
      needsResearch: 0,
      needsVerification: 0,
      suppressed: 0,
    },
    externalResearchPerformed: false,
    crmMutationPerformed: false,
    outreachPerformed: false,
    externalActionAuthorized: false,
  };
}

function sideReview(input?: { sponsorOrganizationId?: string; sponsorLabel?: string; asOf?: string }) {
  return reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: input?.asOf ?? AS_OF,
    evidence: sideEvidence(input),
  });
}

test("joins an exact sponsor-side decision maker to an exact evidence-backed planning window without granting outreach", () => {
  const result = buildSponsorPlanningWindowReviewV1({
    sideReview: sideReview(),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.bindings.length, 1);
  assert.equal(result.bindings[0].personCanonicalId, "person:sponsor-buyer");
  assert.equal(result.bindings[0].organizationCanonicalId, "organization:brand");
  assert.equal(result.bindings[0].timingCandidateId, "timing:brand-next-season");
  assert.equal(result.bindings[0].disposition, "WINDOW_OPEN");
  assert.deepEqual(result.bindings[0].evidenceRefs, [
    "source:sponsor-buyer",
    "source:sponsor-link",
    "source:timing",
  ]);
  assert.equal(result.bindings[0].outreachAuthority, "NOT_GRANTED");
  assert.equal(result.bindings[0].sponsorshipInterest, "NOT_ESTABLISHED");
  assert.equal(result.bindings[0].relationshipAccess, "NOT_ESTABLISHED");
  assert.equal(result.authority.outreachAllowed, false);
  assert.equal(result.authority.approvalBypassAllowed, false);
});

test("never joins on matching organization labels when canonical organization ids differ", () => {
  const result = buildSponsorPlanningWindowReviewV1({
    sideReview: sideReview({ sponsorOrganizationId: "organization:brand-crm", sponsorLabel: "Same Brand" }),
    planning: planning({ organizationRef: "organization:brand-external" }),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_EXACT_MATCHES");
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.unmatchedTimingCandidateIds, ["timing:brand-next-season"]);
});

test("does not bind property-side decision makers to sponsor timing", () => {
  const result = buildSponsorPlanningWindowReviewV1({
    sideReview: sideReview(),
    planning: planning({ organizationRef: "organization:property" }),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_EXACT_MATCHES");
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.unmatchedTimingCandidateIds, ["timing:brand-next-season"]);
});

test("ignores timing evidence scoped to a different opportunity instead of cross-linking it", () => {
  const result = buildSponsorPlanningWindowReviewV1({
    sideReview: sideReview(),
    planning: planning({ opportunityRef: "opportunity:other" }),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "NO_EXACT_MATCHES");
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.unmatchedTimingCandidateIds, []);
});

test("fails closed when sponsor-side or planning evidence is unavailable", () => {
  const result = buildSponsorPlanningWindowReviewV1({
    sideReview: null,
    planning: null,
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "UNAVAILABLE");
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.issues, [
    "PLANNING_WINDOW_REVIEW_UNAVAILABLE",
    "SPONSOR_SIDE_REVIEW_UNAVAILABLE",
  ]);
});

test("fails closed when either evidence set is stale or future-dated at decision time", () => {
  const stale = buildSponsorPlanningWindowReviewV1({
    sideReview: sideReview({ asOf: "2026-09-17T00:00:00.000Z" }),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
    maxAgeMs: 24 * 60 * 60 * 1_000,
  });
  assert.equal(stale.status, "STALE");
  assert.deepEqual(stale.bindings, []);

  const future = buildSponsorPlanningWindowReviewV1({
    sideReview: sideReview(),
    planning: planning({ generatedAt: "2026-09-19T05:00:00.000Z" }),
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(future.status, "STALE");
  assert.deepEqual(future.bindings, []);
});
