import assert from "node:assert/strict";
import test from "node:test";

import type { OpportunityAccessEvidenceV1 } from "@/lib/opportunity-intelligence/opportunity-access-map-v1";
import { buildSponsorDecisionMakerRoleReviewV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-role-review-v1";
import { reviewSponsorDecisionMakerSidesV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-side-v1";
import {
  reconcileDecisionMakerRoleFreshnessV1,
  type DecisionMakerRoleObservationV1,
} from "@/lib/relationship-intelligence/decision-maker-role-freshness-v1";

const OPPORTUNITY_ID = "opportunity:sponsor-role-review";
const AS_OF = "2026-09-19T04:30:00.000Z";
const EVALUATED_AT = "2026-09-19T05:00:00.000Z";

function sponsorBuyer(): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: "buyer-evidence",
    opportunityId: OPPORTUNITY_ID,
    kind: "DECISION_MAKER",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T04:00:00.000Z",
    evidenceRefs: ["source:buyer-role"],
    personCanonicalId: "person:buyer",
    personLabel: "Sponsor Buyer",
    organizationCanonicalId: "organization:sponsor",
    organizationLabel: "Sponsor Brand",
    decisionClass: "PARTNERSHIPS",
  };
}

function sponsorshipLink(): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: "sponsor-evidence",
    opportunityId: OPPORTUNITY_ID,
    kind: "SPONSORSHIP_LINK",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T04:05:00.000Z",
    evidenceRefs: ["source:sponsor-announcement"],
    propertyCanonicalId: "organization:property",
    propertyLabel: "Property",
    sponsorCanonicalId: "organization:sponsor",
    sponsorLabel: "Sponsor Brand",
    relationshipLabel: "OFFICIAL_SPONSOR",
  };
}

function sideReview() {
  return reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [sponsorBuyer(), sponsorshipLink()],
  });
}

function roleObservation(overrides: Partial<DecisionMakerRoleObservationV1> = {}): DecisionMakerRoleObservationV1 {
  return {
    observationId: "role-current",
    canonicalPersonRef: "person:buyer",
    canonicalOrganizationRef: "organization:sponsor",
    observedAt: "2026-09-19T04:15:00.000Z",
    sourceRef: "source:official-leadership-page",
    evidenceRefs: ["source:official-leadership-page"],
    truthState: "KNOWN",
    employmentState: {
      state: "KNOWN",
      value: "CURRENT",
      evidenceRefs: ["source:employment"],
    },
    title: {
      state: "KNOWN",
      value: "VP Partnerships",
      evidenceRefs: ["source:title"],
    },
    decisionFunction: {
      state: "KNOWN",
      value: "Sports sponsorship partnerships",
      evidenceRefs: ["source:function"],
    },
    authorityClass: {
      state: "KNOWN",
      value: "DECISION_MAKER",
      evidenceRefs: ["source:authority"],
    },
    ...overrides,
  };
}

function roleFreshness(observations: readonly DecisionMakerRoleObservationV1[]) {
  return reconcileDecisionMakerRoleFreshnessV1({ observations, now: EVALUATED_AT });
}

test("keeps a sponsor-side buyer only when exact current person and organization role authority is supported", () => {
  const review = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([roleObservation()]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "LIVE");
  assert.equal(review.bindings.length, 1);
  assert.equal(review.bindings[0]?.personCanonicalId, "person:buyer");
  assert.equal(review.bindings[0]?.organizationCanonicalId, "organization:sponsor");
  assert.equal(review.bindings[0]?.title, "VP Partnerships");
  assert.equal(review.bindings[0]?.decisionFunction, "Sports sponsorship partnerships");
  assert.equal(review.bindings[0]?.authorityClass, "DECISION_MAKER");
  assert.equal(review.bindings[0]?.roleState, "CURRENT_ROLE_EVIDENCED");
  assert.equal(review.bindings[0]?.outreachAuthority, "NOT_GRANTED");
  assert.deepEqual(review.bindings[0]?.evidenceRefs, [
    "source:authority",
    "source:buyer-role",
    "source:employment",
    "source:function",
    "source:official-leadership-page",
    "source:sponsor-announcement",
    "source:title",
  ]);
  assert.deepEqual(review.withheld, []);
  assert.equal(review.verificationRequired, false);
});

test("does not fuzzy-match a current role from another canonical person", () => {
  const review = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([
      roleObservation({ canonicalPersonRef: "person:different", title: { state: "KNOWN", value: "VP Partnerships", evidenceRefs: ["source:title"] } }),
    ]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "NO_CURRENT_SPONSOR_BUYERS");
  assert.equal(review.withheld[0]?.reason, "ROLE_NOT_FOUND");
  assert.equal(review.verificationRequired, true);
});

test("fails closed when the exact person is now evidenced at a different organization", () => {
  const review = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([
      roleObservation({ canonicalOrganizationRef: "organization:new-employer" }),
    ]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "NO_CURRENT_SPONSOR_BUYERS");
  assert.equal(review.withheld[0]?.reason, "ROLE_ORGANIZATION_MISMATCH");
  assert.equal(review.withheld[0]?.roleDisposition, "CURRENT_ROLE_SUPPORTED");
});

test("withholds departed stale partial or otherwise unsupported role authority", () => {
  const departed = roleObservation({
    employmentState: { state: "KNOWN", value: "DEPARTED", evidenceRefs: ["source:departure"] },
  });
  const review = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([departed]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "NO_CURRENT_SPONSOR_BUYERS");
  assert.equal(review.withheld[0]?.reason, "ROLE_NOT_CURRENTLY_SUPPORTED");
  assert.equal(review.withheld[0]?.roleDisposition, "NO_CURRENT_ROLE_SUPPORTED");
  assert.equal(review.verificationRequired, true);
});

test("requires revalidation when a newer exact role supersedes a materially different prior role", () => {
  const previous = roleObservation({
    observationId: "role-old",
    observedAt: "2026-09-18T04:15:00.000Z",
    title: { state: "KNOWN", value: "Director Partnerships", evidenceRefs: ["source:old-title"] },
  });
  const current = roleObservation();
  const review = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([previous, current]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "NO_CURRENT_SPONSOR_BUYERS");
  assert.equal(review.withheld[0]?.reason, "ROLE_REVALIDATION_REQUIRED");
  assert.equal(review.withheld[0]?.roleDisposition, "CURRENT_ROLE_SUPPORTED");
});

test("fails closed when the source reviews are older than the decision-time freshness bound", () => {
  const review = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([roleObservation()]),
    evaluatedAt: "2026-09-21T00:00:00.000Z",
  });

  assert.equal(review.status, "STALE");
  assert.equal(review.bindings.length, 0);
  assert.deepEqual(review.issues, ["SPONSOR_OR_ROLE_EVIDENCE_OUTSIDE_FRESHNESS_BOUND"]);
  assert.equal(review.verificationRequired, true);
});

test("does not invent contact data relationship strength confidence or execution authority", () => {
  const review = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([roleObservation()]),
    evaluatedAt: EVALUATED_AT,
  });
  const binding = review.bindings[0] ?? {};

  assert.equal("email" in binding, false);
  assert.equal("phone" in binding, false);
  assert.equal("confidence" in binding, false);
  assert.equal("relationshipStrength" in binding, false);
  assert.equal("sponsorshipInterest" in binding, false);
  assert.equal("opportunityCertainty" in binding, false);
  assert.deepEqual(review.authority, {
    outreachAllowed: false,
    crmMutationAllowed: false,
    opportunityMutationAllowed: false,
    approvalBypassAllowed: false,
  });
});

test("is deterministic regardless of role observation input order", () => {
  const prior = roleObservation({
    observationId: "old",
    observedAt: "2026-09-18T04:15:00.000Z",
  });
  const current = roleObservation();
  const forward = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([prior, current]),
    evaluatedAt: EVALUATED_AT,
  });
  const reverse = buildSponsorDecisionMakerRoleReviewV1({
    sideReview: sideReview(),
    roleFreshness: roleFreshness([current, prior]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.deepEqual(reverse, forward);
});
