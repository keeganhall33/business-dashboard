import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSponsorDecisionMakerGapReviewV1
} from "@/lib/relationship-intelligence/sponsor-decision-maker-gap-review-v1";
import type {
  SponsorOpportunityPortfolioResultV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-portfolio-v1";
import type {
  OpportunityQualificationReadinessResultV1
} from "@/lib/relationship-intelligence/opportunity-qualification-readiness-v1";

function qualification(overrides: Partial<OpportunityQualificationReadinessResultV1["decisions"][number]> = {}): OpportunityQualificationReadinessResultV1 {
  const decision: OpportunityQualificationReadinessResultV1["decisions"][number] = {
    candidateId: "qualification:acme",
    disposition: "READY_FOR_INTERNAL_QUALIFICATION_REVIEW",
    signalType: "SPONSORSHIP_OPPORTUNITY",
    canonicalOrganizationRef: "org:acme",
    canonicalPersonRef: "person:buyer",
    canonicalOpportunityRef: "opportunity:acme-2027",
    observedAt: "2026-09-19T12:00:00.000Z",
    sourceKinds: ["EMAIL"],
    sourceRefs: ["source:email:1"],
    evidenceRefs: ["evidence:qualification:1"],
    supportedContext: ["DECISION_MAKER_AUTHORITY"],
    sponsorInterest: "NOT_ESTABLISHED",
    budgetAvailability: "NOT_ESTABLISHED",
    opportunityCertainty: "NOT_ESTABLISHED",
    dealLikelihood: "NOT_ESTABLISHED",
    confidenceFromSourceCount: "NOT_ESTABLISHED",
    qualificationOutcome: "NOT_ESTABLISHED",
    nextInternalAction: "REVIEW_EVIDENCE_PACKET",
    evidenceGaps: [],
    reasonCodes: ["EXACT_CANONICAL_ANCHOR_PRESENT"],
    ...overrides
  };

  const counts = {
    READY_FOR_INTERNAL_QUALIFICATION_REVIEW: 0,
    CONTEXT_ONLY: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
  counts[decision.disposition] += 1;

  return {
    version: "OPPORTUNITY_QUALIFICATION_READINESS_V1",
    generatedAt: "2026-09-19T12:05:00.000Z",
    status: "READY",
    issues: [],
    decisions: [decision],
    counts,
    limitations: ["Internal review only."],
    authority: {
      analysisOnly: true,
      internalQualificationReviewAllowed: true,
      qualificationMutationAuthorized: false,
      crmMutationAuthorized: false,
      relationshipMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      contractAuthorized: false,
      externalActionAuthorized: false
    }
  };
}

function portfolio(overrides: Partial<SponsorOpportunityPortfolioResultV1["entries"][number]> = {}): SponsorOpportunityPortfolioResultV1 {
  const entry: SponsorOpportunityPortfolioResultV1["entries"][number] = {
    portfolioEntryId: "portfolio:acme",
    sponsorCandidateId: "sponsor:acme",
    qualificationCandidateId: "qualification:acme",
    canonicalOpportunityRef: "opportunity:acme-2027",
    canonicalOrganizationRef: "org:acme",
    sponsorCanonicalPersonRef: "person:buyer",
    qualificationCanonicalPersonRef: "person:buyer",
    linkedCanonicalPersonRef: "person:buyer",
    state: "REVIEW_NOW",
    attentionClass: "PREPARE_NOW",
    qualificationDisposition: "READY_FOR_INTERNAL_QUALIFICATION_REVIEW",
    idealOutreachDateRange: {
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-10-15T00:00:00.000Z"
    },
    timingRationale: "Evidence-backed planning window is open.",
    supportedContext: ["DECISION_MAKER_AUTHORITY"],
    nextInternalAction: "REVIEW_PREPARATION_AND_QUALIFICATION_PACKET",
    evidenceRefs: ["evidence:portfolio:1"],
    gaps: [],
    reasonCodes: ["EXPLICIT_CANONICAL_OPPORTUNITY_BINDING_VERIFIED"],
    sponsorInterest: "NOT_ESTABLISHED",
    budgetAvailability: "NOT_ESTABLISHED",
    opportunityCertainty: "NOT_ESTABLISHED",
    dealLikelihood: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    causalInterpretation: "NOT_ESTABLISHED",
    ...overrides
  };

  const counts = {
    REVIEW_NOW: 0,
    PLAN_AHEAD: 0,
    ACCESS_BLOCKED: 0,
    RECOVER_NEXT_CYCLE: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    CONTEXT_ONLY: 0,
    SUPPRESS: 0
  };
  counts[entry.state] += 1;

  return {
    version: "SPONSOR_OPPORTUNITY_PORTFOLIO_V1",
    generatedAt: "2026-09-19T12:10:00.000Z",
    status: "READY",
    issues: [],
    entries: [entry],
    counts,
    orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE",
    matchingPolicy: "EXPLICIT_BINDING_PLUS_EXACT_CANONICAL_IDENTITY_ONLY",
    limitations: ["Internal review only."],
    authority: {
      analysisOnly: true,
      internalReviewAllowed: true,
      internalPreparationAllowed: true,
      qualificationMutationAuthorized: false,
      crmMutationAuthorized: false,
      relationshipMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      contractAuthorized: false,
      externalActionAuthorized: false,
      approvalBypassAuthorized: false
    }
  };
}

const evaluatedAt = "2026-09-19T12:20:00.000Z";

test("marks an exact person binding with explicit decision-maker context ready for internal review only", () => {
  const result = buildSponsorDecisionMakerGapReviewV1({
    evaluatedAt,
    portfolio: portfolio(),
    qualification: qualification(),
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "READY");
  assert.equal(result.decisions[0].disposition, "READY_FOR_INTERNAL_DECISION_MAKER_REVIEW");
  assert.equal(result.decisions[0].canonicalPersonRef, "person:buyer");
  assert.equal(result.decisions[0].decisionMakerAuthorityEvidence, "SUPPORTED_CONTEXT_PRESENT");
  assert.equal(result.decisions[0].sponsorPersonBinding, "EXACT_MATCH");
  assert.equal(result.decisions[0].budgetAuthority, "NOT_ESTABLISHED");
  assert.equal(result.decisions[0].sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.decisionMakerFactPromotionAuthorized, false);
});

test("requires research when decision-maker authority context is absent instead of inferring it from a canonical person", () => {
  const result = buildSponsorDecisionMakerGapReviewV1({
    evaluatedAt,
    portfolio: portfolio(),
    qualification: qualification({ supportedContext: [] }),
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(result.decisions[0].nextInternalAction, "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE");
  assert.equal(result.decisions[0].decisionMakerAuthorityEvidence, "NOT_ESTABLISHED");
  assert.ok(result.decisions[0].reasonCodes.includes("DECISION_MAKER_AUTHORITY_EVIDENCE_NOT_ESTABLISHED"));
});

test("requires sponsor-side person binding before treating qualification person evidence as aligned", () => {
  const result = buildSponsorDecisionMakerGapReviewV1({
    evaluatedAt,
    portfolio: portfolio({
      sponsorCanonicalPersonRef: null,
      linkedCanonicalPersonRef: null
    }),
    qualification: qualification(),
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(result.decisions[0].nextInternalAction, "RESOLVE_SPONSOR_PERSON_BINDING");
  assert.equal(result.decisions[0].decisionMakerAuthorityEvidence, "SUPPORTED_CONTEXT_PRESENT");
  assert.equal(result.decisions[0].sponsorPersonBinding, "MISSING");
});

test("fails closed to verification when sponsor and qualification canonical people conflict", () => {
  const result = buildSponsorDecisionMakerGapReviewV1({
    evaluatedAt,
    portfolio: portfolio({
      sponsorCanonicalPersonRef: "person:other",
      linkedCanonicalPersonRef: null
    }),
    qualification: qualification(),
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.decisions[0].nextInternalAction, "VERIFY_CANONICAL_PERSON_IDENTITY");
  assert.equal(result.decisions[0].sponsorPersonBinding, "CONFLICTED");
  assert.equal(result.decisions[0].confidence, "NOT_ESTABLISHED");
});

test("blocks stale upstream projections", () => {
  const sourcePortfolio = portfolio();
  const result = buildSponsorDecisionMakerGapReviewV1({
    evaluatedAt: "2026-09-20T12:20:00.000Z",
    portfolio: sourcePortfolio,
    qualification: qualification(),
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.decisions, []);
  assert.ok(result.issues.includes("PORTFOLIO_PROJECTION_STALE"));
  assert.ok(result.issues.includes("QUALIFICATION_PROJECTION_STALE"));
});

test("blocks widened upstream authority", () => {
  const unsafe = portfolio();
  const widened = {
    ...unsafe,
    authority: {
      ...unsafe.authority,
      outreachAuthorized: true
    }
  } as unknown as SponsorOpportunityPortfolioResultV1;

  const result = buildSponsorDecisionMakerGapReviewV1({
    evaluatedAt,
    portfolio: widened,
    qualification: qualification(),
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("PORTFOLIO_AUTHORITY_INVARIANT_FAILED"));
});
