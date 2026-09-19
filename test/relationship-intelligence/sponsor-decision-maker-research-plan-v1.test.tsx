import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSponsorDecisionMakerResearchPlanV1
} from "@/lib/relationship-intelligence/sponsor-decision-maker-research-plan-v1";
import type {
  SponsorDecisionMakerGapReviewResultV1
} from "@/lib/relationship-intelligence/sponsor-decision-maker-gap-review-v1";

type GapDecision = SponsorDecisionMakerGapReviewResultV1["decisions"][number];

function decision(overrides: Partial<GapDecision> = {}): GapDecision {
  return {
    portfolioEntryId: "portfolio:acme",
    sponsorCandidateId: "sponsor:acme",
    qualificationCandidateId: "qualification:acme",
    canonicalOpportunityRef: "opportunity:acme-2027",
    canonicalOrganizationRef: "org:acme",
    canonicalPersonRef: "person:buyer",
    portfolioState: "RESEARCH_REQUIRED",
    disposition: "RESEARCH_REQUIRED",
    nextInternalAction: "RESEARCH_CURRENT_DECISION_MAKER_EVIDENCE",
    decisionMakerAuthorityEvidence: "NOT_ESTABLISHED",
    sponsorPersonBinding: "MISSING",
    evidenceRefs: ["evidence:portfolio:1", "evidence:qualification:1"],
    reasonCodes: ["DECISION_MAKER_AUTHORITY_EVIDENCE_NOT_ESTABLISHED"],
    sponsorInterest: "NOT_ESTABLISHED",
    budgetAuthority: "NOT_ESTABLISHED",
    willingnessToEngage: "NOT_ESTABLISHED",
    contactCoordinates: null,
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    ...overrides
  };
}

function review(decisions: readonly GapDecision[]): SponsorDecisionMakerGapReviewResultV1 {
  const counts = {
    READY_FOR_INTERNAL_DECISION_MAKER_REVIEW: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    NOT_APPLICABLE: 0,
    SUPPRESS: 0
  };
  for (const item of decisions) counts[item.disposition] += 1;

  return {
    version: "SPONSOR_DECISION_MAKER_GAP_REVIEW_V1",
    generatedAt: "2026-09-19T15:00:00.000Z",
    status: "READY",
    issues: [],
    decisions,
    counts,
    matchingPolicy: "EXACT_QUALIFICATION_CANDIDATE_AND_CANONICAL_IDENTITY_ONLY",
    orderingPolicy: "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE",
    limitations: ["Internal review only."],
    authority: {
      analysisOnly: true,
      internalReviewAllowed: true,
      internalResearchPreparationAllowed: true,
      decisionMakerFactPromotionAuthorized: false,
      relationshipMutationAuthorized: false,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      contractAuthorized: false,
      externalActionAuthorized: false
    }
  };
}

const evaluatedAt = "2026-09-19T15:20:00.000Z";

test("turns an exact missing decision-maker gap into bounded research work", () => {
  const result = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: review([decision()]),
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "READY");
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].workType, "RESEARCH_CURRENT_DECISION_MAKER");
  assert.equal(result.tasks[0].evidenceNeed, "CURRENT_DECISION_MAKER_EVIDENCE");
  assert.equal(result.tasks[0].canonicalOrganizationRef, "org:acme");
  assert.equal(result.tasks[0].canonicalPersonRef, "person:buyer");
  assert.deepEqual(result.tasks[0].allowedSourceClasses, [
    "OFFICIAL_ORGANIZATION_SOURCE",
    "PUBLIC_PRIMARY_SOURCE",
    "AUTHORIZED_FIRST_PARTY"
  ]);
  assert.equal(result.tasks[0].decisionAuthorityInferenceAuthorized, false);
  assert.equal(result.tasks[0].privateContactDiscoveryAuthorized, false);
  assert.equal(result.authority.externalResearchExecutionAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.returnPolicy, "OBSERVED_EVIDENCE_MUST_REENTER_CANONICAL_REVIEW");
});

test("routes exact sponsor-person binding gaps through canonical and authorized evidence only", () => {
  const source = decision({
    nextInternalAction: "RESOLVE_SPONSOR_PERSON_BINDING",
    decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT",
    reasonCodes: ["DECISION_MAKER_CONTEXT_EVIDENCED_BUT_SPONSOR_PERSON_BINDING_MISSING"]
  });

  const result = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: review([source]),
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "READY");
  assert.equal(result.tasks[0].workType, "RESOLVE_SPONSOR_PERSON_BINDING");
  assert.equal(result.tasks[0].evidenceNeed, "EXACT_SPONSOR_PERSON_BINDING");
  assert.deepEqual(result.tasks[0].allowedSourceClasses, [
    "CANONICAL_RELATIONSHIP_GRAPH",
    "AUTHORIZED_FIRST_PARTY",
    "OFFICIAL_ORGANIZATION_SOURCE"
  ]);
  assert.equal(result.tasks[0].relationshipInferenceAuthorized, false);
  assert.equal(result.tasks[0].sponsorshipInferenceAuthorized, false);
});

test("preserves verification work instead of treating conflicting people as a new buyer", () => {
  const source = decision({
    portfolioState: "VERIFY_REQUIRED",
    disposition: "VERIFY_REQUIRED",
    nextInternalAction: "VERIFY_CANONICAL_PERSON_IDENTITY",
    decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT",
    sponsorPersonBinding: "CONFLICTED",
    reasonCodes: ["SPONSOR_AND_QUALIFICATION_PERSON_REFS_DISAGREE"]
  });

  const result = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: review([source]),
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "READY");
  assert.equal(result.tasks[0].workType, "VERIFY_CANONICAL_PERSON_IDENTITY");
  assert.equal(result.tasks[0].canonicalPersonRef, "person:buyer");
  assert.equal(result.tasks[0].opportunityQualificationAuthorized, false);
  assert.equal(result.tasks[0].factCreationAuthorized, false);
});

test("does not create research work for already-ready, context-only, or suppressed decisions", () => {
  const ready = decision({
    portfolioEntryId: "portfolio:ready",
    sponsorCandidateId: "sponsor:ready",
    portfolioState: "REVIEW_NOW",
    disposition: "READY_FOR_INTERNAL_DECISION_MAKER_REVIEW",
    nextInternalAction: "REVIEW_EVIDENCED_DECISION_MAKER_CONTEXT",
    decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT",
    sponsorPersonBinding: "EXACT_MATCH",
    reasonCodes: ["EXACT_PERSON_BINDING_AND_DECISION_MAKER_CONTEXT_PRESENT"]
  });
  const context = decision({
    portfolioEntryId: "portfolio:context",
    sponsorCandidateId: "sponsor:context",
    canonicalPersonRef: null,
    portfolioState: "CONTEXT_ONLY",
    disposition: "NOT_APPLICABLE",
    nextInternalAction: "NONE",
    reasonCodes: ["CONTEXT_ONLY_ENTRY_NOT_PROMOTED_TO_DECISION_MAKER_WORK"]
  });
  const suppressed = decision({
    portfolioEntryId: "portfolio:suppressed",
    sponsorCandidateId: "sponsor:suppressed",
    canonicalPersonRef: null,
    portfolioState: "SUPPRESS",
    disposition: "SUPPRESS",
    nextInternalAction: "NONE",
    reasonCodes: ["UPSTREAM_PORTFOLIO_SUPPRESSED"]
  });

  const result = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: review([ready, context, suppressed]),
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "NO_RESEARCH_NEEDED");
  assert.deepEqual(result.tasks, []);
});

test("fails closed when a research task lacks the exact canonical organization target", () => {
  const result = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: review([decision({ canonicalOrganizationRef: null })]),
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.tasks, []);
  assert.ok(result.issues.includes("CURRENT_DECISION_MAKER_RESEARCH_REQUIRES_ORGANIZATION:portfolio:acme"));
});

test("blocks stale projections, count drift, widened authority, duplicate identities, and unsafe evidence refs", () => {
  const base = review([decision()]);
  const stale = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: base,
    evaluatedAt: "2026-09-20T15:20:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.ok(stale.issues.includes("GAP_REVIEW_PROJECTION_STALE"));

  const countDrift = {
    ...base,
    counts: { ...base.counts, RESEARCH_REQUIRED: 2 }
  } as SponsorDecisionMakerGapReviewResultV1;
  const drift = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: countDrift,
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });
  assert.ok(drift.issues.includes("GAP_REVIEW_COUNT_DRIFT"));

  const widened = {
    ...base,
    authority: { ...base.authority, outreachAuthorized: true }
  } as unknown as SponsorDecisionMakerGapReviewResultV1;
  const unsafeAuthority = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: widened,
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });
  assert.ok(unsafeAuthority.issues.includes("GAP_REVIEW_AUTHORITY_INVARIANT_FAILED"));

  const duplicate = review([
    decision(),
    decision({ sponsorCandidateId: "sponsor:other" })
  ]);
  const duplicateResult = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: duplicate,
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  });
  assert.ok(duplicateResult.issues.includes("DUPLICATE_PORTFOLIO_ENTRY:portfolio:acme"));

  assert.throws(() => buildSponsorDecisionMakerResearchPlanV1({
    gapReview: review([decision({ evidenceRefs: ["mailto:private@example.com"] })]),
    evaluatedAt,
    maximumProjectionAgeMinutes: 60
  }), /evidenceRefs\[0\] is unsafe/);
});

test("caps work without inventing a business-value ranking", () => {
  const first = decision({ portfolioEntryId: "portfolio:first", sponsorCandidateId: "sponsor:first" });
  const second = decision({
    portfolioEntryId: "portfolio:second",
    sponsorCandidateId: "sponsor:second",
    nextInternalAction: "RESOLVE_SPONSOR_PERSON_BINDING",
    decisionMakerAuthorityEvidence: "SUPPORTED_CONTEXT_PRESENT"
  });

  const result = buildSponsorDecisionMakerResearchPlanV1({
    gapReview: review([first, second]),
    evaluatedAt,
    maximumProjectionAgeMinutes: 60,
    maximumTasks: 1
  });

  assert.equal(result.status, "READY");
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].portfolioEntryId, "portfolio:first");
  assert.equal(result.omittedTaskCount, 1);
  assert.equal(result.orderingPolicy, "PRESERVE_UPSTREAM_SAFETY_AND_WORKFLOW_ORDER");
});
