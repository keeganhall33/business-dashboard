import assert from "node:assert/strict";
import test from "node:test";

import type { OpportunityAccessEvidenceV1 } from "@/lib/opportunity-intelligence/opportunity-access-map-v1";
import { reviewSponsorDecisionMakerSidesV1 } from "@/lib/opportunity-intelligence/sponsor-decision-maker-side-v1";
import { buildSponsorWarmAccessReviewV1 } from "@/lib/opportunity-intelligence/sponsor-warm-access-review-v1";

const OPPORTUNITY_ID = "opportunity:sponsor-warm-path";
const AS_OF = "2026-09-19T04:30:00.000Z";
const EVALUATED_AT = "2026-09-19T05:00:00.000Z";

function decisionMaker(input: {
  evidenceId: string;
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
}): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: input.evidenceId,
    opportunityId: OPPORTUNITY_ID,
    kind: "DECISION_MAKER",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T04:00:00.000Z",
    evidenceRefs: [`source:${input.evidenceId}`],
    personCanonicalId: input.personCanonicalId,
    personLabel: input.personLabel,
    organizationCanonicalId: input.organizationCanonicalId,
    organizationLabel: input.organizationLabel,
    decisionClass: "PARTNERSHIPS",
  };
}

function sponsorshipLink(): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: "sponsor-link",
    opportunityId: OPPORTUNITY_ID,
    kind: "SPONSORSHIP_LINK",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T04:05:00.000Z",
    evidenceRefs: ["source:sponsor-link"],
    propertyCanonicalId: "organization:property",
    propertyLabel: "Property",
    sponsorCanonicalId: "organization:brand",
    sponsorLabel: "Brand",
    relationshipLabel: "OFFICIAL_SPONSOR",
  };
}

function warmPath(input: {
  evidenceId: string;
  terminalCanonicalId: string;
  terminalLabel: string;
  terminalEntityType?: "PERSON" | "COMPANY";
  truthState?: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
}): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: input.evidenceId,
    opportunityId: OPPORTUNITY_ID,
    kind: "WARM_ACCESS_PATH",
    truthState: input.truthState ?? "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T04:10:00.000Z",
    evidenceRefs: [`source:${input.evidenceId}`],
    path: [
      { entityType: "PERSON", canonicalId: "person:keegan-hall", label: "Keegan Hall" },
      { entityType: "PERSON", canonicalId: "person:introducer", label: "Documented Introducer" },
      {
        entityType: input.terminalEntityType ?? "PERSON",
        canonicalId: input.terminalCanonicalId,
        label: input.terminalLabel,
      },
    ],
    reasonForIntroduction: "A documented relationship path reaches the evidenced endpoint.",
  };
}

function sideReview(evidence: readonly OpportunityAccessEvidenceV1[]) {
  return reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence,
  });
}

function sponsorBuyer(): OpportunityAccessEvidenceV1 {
  return decisionMaker({
    evidenceId: "brand-buyer",
    personCanonicalId: "person:brand-buyer",
    personLabel: "Brand Buyer",
    organizationCanonicalId: "organization:brand",
    organizationLabel: "Brand",
  });
}

test("binds a warm path only when its terminal person is the exact sponsor-side decision maker", () => {
  const review = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview([
      sponsorBuyer(),
      sponsorshipLink(),
      warmPath({
        evidenceId: "warm-path",
        terminalCanonicalId: "person:brand-buyer",
        terminalLabel: "Brand Buyer",
      }),
    ]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "LIVE");
  assert.equal(review.bindings.length, 1);
  assert.equal(review.bindings[0]?.personCanonicalId, "person:brand-buyer");
  assert.equal(review.bindings[0]?.organizationCanonicalId, "organization:brand");
  assert.deepEqual(review.bindings[0]?.warmPathEvidenceIds, ["warm-path"]);
  assert.deepEqual(review.bindings[0]?.decisionMakerEvidenceIds, ["brand-buyer"]);
  assert.deepEqual(review.bindings[0]?.evidenceRefs, [
    "source:brand-buyer",
    "source:sponsor-link",
    "source:warm-path",
  ]);
  assert.equal(review.bindings[0]?.relationshipAccess, "EVIDENCED_PATH_ONLY");
  assert.equal(review.bindings[0]?.introductionWillingness, "NOT_ESTABLISHED");
  assert.equal(review.bindings[0]?.outreachAuthority, "NOT_GRANTED");
  assert.deepEqual(review.sponsorSideBuyerIdsWithoutWarmPath, []);
  assert.deepEqual(review.unmatchedWarmPathEvidenceIds, []);
  assert.equal(review.verificationRequired, false);
  assert.deepEqual(review.authority, {
    outreachAllowed: false,
    crmMutationAllowed: false,
    opportunityMutationAllowed: false,
    approvalBypassAllowed: false,
  });
});

test("does not fuzzy-match a warm path by person label", () => {
  const review = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview([
      sponsorBuyer(),
      sponsorshipLink(),
      warmPath({
        evidenceId: "wrong-id-path",
        terminalCanonicalId: "person:different-brand-buyer",
        terminalLabel: "Brand Buyer",
      }),
    ]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "NO_EXACT_MATCHES");
  assert.deepEqual(review.sponsorSideBuyerIdsWithoutWarmPath, ["person:brand-buyer"]);
  assert.deepEqual(review.unmatchedWarmPathEvidenceIds, ["wrong-id-path"]);
  assert.equal(review.verificationRequired, true);
  assert.deepEqual(review.issues, [
    "SPONSOR_SIDE_BUYER_WITHOUT_EXACT_WARM_PATH",
    "WARM_PATH_NOT_BOUND_TO_SPONSOR_SIDE_BUYER",
  ]);
});

test("does not treat an organization endpoint as access to a specific buyer", () => {
  const review = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview([
      sponsorBuyer(),
      sponsorshipLink(),
      warmPath({
        evidenceId: "organization-path",
        terminalCanonicalId: "organization:brand",
        terminalLabel: "Brand",
        terminalEntityType: "COMPANY",
      }),
    ]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "NO_EXACT_MATCHES");
  assert.deepEqual(review.sponsorSideBuyerIdsWithoutWarmPath, ["person:brand-buyer"]);
  assert.deepEqual(review.unmatchedWarmPathEvidenceIds, ["organization-path"]);
});

test("does not bind a warm path to a property-side decision maker", () => {
  const propertyBuyer = decisionMaker({
    evidenceId: "property-buyer",
    personCanonicalId: "person:property-buyer",
    personLabel: "Property Buyer",
    organizationCanonicalId: "organization:property",
    organizationLabel: "Property",
  });
  const review = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview([
      propertyBuyer,
      sponsorshipLink(),
      warmPath({
        evidenceId: "property-path",
        terminalCanonicalId: "person:property-buyer",
        terminalLabel: "Property Buyer",
      }),
    ]),
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(review.status, "NO_EXACT_MATCHES");
  assert.equal(review.bindings.length, 0);
  assert.deepEqual(review.sponsorSideBuyerIdsWithoutWarmPath, []);
  assert.deepEqual(review.unmatchedWarmPathEvidenceIds, ["property-path"]);
});

test("withheld warm-path evidence cannot establish relationship access", () => {
  const sourceReview = sideReview([
    sponsorBuyer(),
    sponsorshipLink(),
    warmPath({
      evidenceId: "inferred-path",
      terminalCanonicalId: "person:brand-buyer",
      terminalLabel: "Brand Buyer",
      truthState: "INFERRED",
    }),
  ]);
  const review = buildSponsorWarmAccessReviewV1({ sideReview: sourceReview, evaluatedAt: EVALUATED_AT });

  assert.equal(sourceReview.accessMap.warmAccessPaths.length, 0);
  assert.equal(sourceReview.accessMap.withheld.find((entry) => entry.evidenceId === "inferred-path")?.reason, "INFERRED");
  assert.equal(review.status, "NO_EXACT_MATCHES");
  assert.deepEqual(review.sponsorSideBuyerIdsWithoutWarmPath, ["person:brand-buyer"]);
  assert.deepEqual(review.unmatchedWarmPathEvidenceIds, []);
});

test("fails closed when the sponsor access review itself is outside the freshness bound", () => {
  const review = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview([sponsorBuyer(), sponsorshipLink()]),
    evaluatedAt: "2026-09-21T00:00:00.000Z",
  });

  assert.equal(review.status, "STALE");
  assert.equal(review.bindings.length, 0);
  assert.deepEqual(review.issues, ["SPONSOR_ACCESS_EVIDENCE_OUTSIDE_FRESHNESS_BOUND"]);
  assert.equal(review.verificationRequired, true);
});

test("preserves evidence without inventing confidence willingness contact data or relationship strength", () => {
  const review = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview([
      sponsorBuyer(),
      sponsorshipLink(),
      warmPath({
        evidenceId: "warm-path",
        terminalCanonicalId: "person:brand-buyer",
        terminalLabel: "Brand Buyer",
      }),
    ]),
    evaluatedAt: EVALUATED_AT,
  });
  const binding = review.bindings[0] ?? {};

  assert.equal("confidence" in binding, false);
  assert.equal("email" in binding, false);
  assert.equal("phone" in binding, false);
  assert.equal("relationshipStrength" in binding, false);
  assert.equal("introductionLikelihood" in binding, false);
  assert.equal("opportunityCertainty" in binding, false);
});

test("is deterministic regardless of evidence input order", () => {
  const evidence = [
    sponsorBuyer(),
    sponsorshipLink(),
    warmPath({
      evidenceId: "warm-path",
      terminalCanonicalId: "person:brand-buyer",
      terminalLabel: "Brand Buyer",
    }),
  ];
  const forward = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview(evidence),
    evaluatedAt: EVALUATED_AT,
  });
  const reverse = buildSponsorWarmAccessReviewV1({
    sideReview: sideReview([...evidence].reverse()),
    evaluatedAt: EVALUATED_AT,
  });

  assert.deepEqual(reverse, forward);
});
