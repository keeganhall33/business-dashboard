import assert from "node:assert/strict";
import test from "node:test";

import type { OpportunityQualificationAccessBriefResultV1 } from "@/lib/opportunity-intelligence/opportunity-qualification-access-brief-v1";
import type { SponsorDecisionMakerRoleReviewV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-role-review-v1";
import type { SponsorPlanningWindowReviewV1 } from "@/lib/opportunity-intelligence/sponsor-planning-window-review-v1";
import { buildSponsorPursuitEvidenceBriefV1 } from "@/lib/opportunity-intelligence/sponsor-pursuit-evidence-brief-v1";
import type { SponsorWarmAccessReviewV1 } from "@/lib/opportunity-intelligence/sponsor-warm-access-review-v1";

const OPPORTUNITY_ID = "opportunity:sponsor-pursuit";
const PERSON_ID = "person:sponsor-buyer";
const ORGANIZATION_ID = "organization:sponsor";
const SOURCE_AT = "2026-09-19T05:00:00.000Z";
const EVALUATED_AT = "2026-09-19T06:00:00.000Z";

const restrictiveAuthority = Object.freeze({
  outreachAllowed: false,
  crmMutationAllowed: false,
  opportunityMutationAllowed: false,
  approvalBypassAllowed: false,
} as const);

function qualification(input?: {
  opportunityId?: string;
  disposition?: "READY_FOR_INTERNAL_REVIEW" | "CONTEXT_ONLY" | "RESEARCH_REQUIRED" | "VERIFY_REQUIRED" | "SUPPRESS";
  generatedAt?: string;
}): OpportunityQualificationAccessBriefResultV1 {
  return {
    status: "READY",
    generatedAt: input?.generatedAt ?? SOURCE_AT,
    decisions: [
      {
        candidateId: "candidate:qualified-sponsor",
        canonicalOpportunityRef: input?.opportunityId ?? OPPORTUNITY_ID,
        disposition: input?.disposition ?? "READY_FOR_INTERNAL_REVIEW",
        evidenceRefs: ["source:qualification"],
      },
    ],
    authority: {
      analysisOnly: true,
      internalReviewAllowed: true,
      qualificationMutationAuthorized: false,
      crmMutationAuthorized: false,
      relationshipMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      contractAuthorized: false,
      externalActionAuthorized: false,
    },
  } as unknown as OpportunityQualificationAccessBriefResultV1;
}

function roleReview(input?: {
  opportunityId?: string;
  status?: SponsorDecisionMakerRoleReviewV1["status"];
  evaluatedAt?: string;
  verificationRequired?: boolean;
}): SponsorDecisionMakerRoleReviewV1 {
  return {
    status: input?.status ?? "LIVE",
    opportunityId: input?.opportunityId ?? OPPORTUNITY_ID,
    evaluatedAt: input?.evaluatedAt ?? SOURCE_AT,
    bindings: [
      {
        personCanonicalId: PERSON_ID,
        personLabel: "Sponsor Buyer",
        organizationCanonicalId: ORGANIZATION_ID,
        organizationLabel: "Sponsor Brand",
        decisionClass: "PARTNERSHIPS",
        currentRoleObservationId: "role:current",
        title: "VP Partnerships",
        decisionFunction: "PARTNERSHIPS",
        authorityClass: "DECISION_MAKER",
        evidenceRefs: ["source:current-role"],
      },
    ],
    issues: [],
    verificationRequired: input?.verificationRequired ?? false,
    authority: restrictiveAuthority,
  } as unknown as SponsorDecisionMakerRoleReviewV1;
}

function warmAccess(input?: {
  personId?: string;
  opportunityId?: string;
  status?: SponsorWarmAccessReviewV1["status"];
  evaluatedAt?: string;
  verificationRequired?: boolean;
}): SponsorWarmAccessReviewV1 {
  return {
    status: input?.status ?? "LIVE",
    opportunityId: input?.opportunityId ?? OPPORTUNITY_ID,
    evaluatedAt: input?.evaluatedAt ?? SOURCE_AT,
    bindings: [
      {
        personCanonicalId: input?.personId ?? PERSON_ID,
        organizationCanonicalId: ORGANIZATION_ID,
        warmPathEvidenceIds: ["warm-path:1"],
        evidenceRefs: ["source:warm-path"],
      },
    ],
    issues: [],
    verificationRequired: input?.verificationRequired ?? false,
    authority: restrictiveAuthority,
  } as unknown as SponsorWarmAccessReviewV1;
}

function planning(input?: {
  personId?: string;
  opportunityId?: string;
  status?: SponsorPlanningWindowReviewV1["status"];
  evaluatedAt?: string;
  disposition?: "PLAN_AHEAD" | "WINDOW_OPEN" | "MISSED_PLANNING_WINDOW" | "NEEDS_RESEARCH" | "NEEDS_VERIFICATION" | "SUPPRESS";
}): SponsorPlanningWindowReviewV1 {
  return {
    status: input?.status ?? "LIVE",
    opportunityId: input?.opportunityId ?? OPPORTUNITY_ID,
    evaluatedAt: input?.evaluatedAt ?? SOURCE_AT,
    bindings: [
      {
        personCanonicalId: input?.personId ?? PERSON_ID,
        organizationCanonicalId: ORGANIZATION_ID,
        timingCandidateId: "timing:1",
        disposition: input?.disposition ?? "PLAN_AHEAD",
        evidenceRefs: ["source:planning-window"],
      },
    ],
    issues: [],
    authority: restrictiveAuthority,
  } as unknown as SponsorPlanningWindowReviewV1;
}

test("exact current buyer + exact warm path + exact actionable planning + qualification becomes internal-review ready only", () => {
  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification(),
    roleReview: roleReview(),
    warmAccess: warmAccess(),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.buyers.length, 1);
  assert.equal(result.buyers[0].disposition, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(result.buyers[0].outreachAuthority, "NOT_GRANTED");
  assert.equal(result.buyers[0].sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.buyers[0].budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(result.buyers[0].introductionWillingness, "NOT_ESTABLISHED");
  assert.equal(result.buyers[0].opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(result.buyers[0].confidence, "NOT_ESTABLISHED");
  assert.equal(result.buyers[0].monetaryValue, null);
  assert.deepEqual(result.buyers[0].qualificationCandidateIds, ["candidate:qualified-sponsor"]);
  assert.deepEqual(result.buyers[0].warmPathEvidenceIds, ["warm-path:1"]);
  assert.deepEqual(result.buyers[0].timingCandidateIds, ["timing:1"]);
  assert.equal(result.authority.outreachAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("a warm path to another canonical person cannot make the current sponsor buyer ready", () => {
  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification(),
    roleReview: roleReview(),
    warmAccess: warmAccess({ personId: "person:someone-else" }),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.buyers[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(result.buyers[0].reasonCodes.includes("EXACT_WARM_PATH_MISSING"));
  assert.deepEqual(result.buyers[0].warmPathEvidenceIds, []);
});

test("qualification for a different opportunity cannot qualify this sponsor pursuit", () => {
  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification({ opportunityId: "opportunity:other" }),
    roleReview: roleReview(),
    warmAccess: warmAccess(),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.buyers[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(result.buyers[0].reasonCodes.includes("QUALIFICATION_NOT_READY_FOR_INTERNAL_REVIEW"));
  assert.ok(result.issues.includes("NO_EXACT_QUALIFICATION_DECISION"));
});

test("verification upstream dominates readiness and never creates outreach authority", () => {
  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification(),
    roleReview: roleReview({ verificationRequired: true }),
    warmAccess: warmAccess(),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.buyers[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.buyers[0].nextInternalAction, "VERIFY_UPSTREAM_EVIDENCE");
  assert.equal(result.authority.outreachAllowed, false);
});

test("a missed planning window is retained as timing review, not treated as a current opening", () => {
  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification(),
    roleReview: roleReview(),
    warmAccess: warmAccess(),
    planning: planning({ disposition: "MISSED_PLANNING_WINDOW" }),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.buyers[0].disposition, "TIMING_REVIEW_REQUIRED");
  assert.equal(result.buyers[0].nextInternalAction, "REVIEW_NEXT_PLANNING_CYCLE");
});

test("stale relationship evidence fails the entire brief closed", () => {
  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification(),
    roleReview: roleReview({ status: "STALE" }),
    warmAccess: warmAccess(),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "STALE");
  assert.deepEqual(result.buyers, []);
});

test("mismatched upstream opportunity identities block the join", () => {
  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification(),
    roleReview: roleReview(),
    warmAccess: warmAccess({ opportunityId: "opportunity:other" }),
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("OPPORTUNITY_IDENTITY_MISMATCH"));
});

test("widened upstream authority blocks the brief instead of inheriting unsafe permissions", () => {
  const unsafeWarm = warmAccess() as unknown as {
    authority: { outreachAllowed: boolean; crmMutationAllowed: false; opportunityMutationAllowed: false; approvalBypassAllowed: false };
  };
  unsafeWarm.authority = { ...restrictiveAuthority, outreachAllowed: true };

  const result = buildSponsorPursuitEvidenceBriefV1({
    qualification: qualification(),
    roleReview: roleReview(),
    warmAccess: unsafeWarm as unknown as SponsorWarmAccessReviewV1,
    planning: planning(),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("WARM_ACCESS_AUTHORITY_WIDENED"));
  assert.equal(result.authority.outreachAllowed, false);
});
