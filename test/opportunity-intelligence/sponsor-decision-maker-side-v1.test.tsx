import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewSponsorDecisionMakerSidesV1
} from "@/lib/opportunity-intelligence/sponsor-decision-maker-side-v1";
import type { OpportunityAccessEvidenceV1 } from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

const OPPORTUNITY_ID = "opportunity:sponsor-side-review";
const AS_OF = "2026-09-19T03:00:00.000Z";

function decisionMaker(
  organizationCanonicalId: string,
  organizationLabel: string,
  evidenceId: string
): OpportunityAccessEvidenceV1 {
  return {
    evidenceId,
    opportunityId: OPPORTUNITY_ID,
    kind: "DECISION_MAKER",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T02:00:00.000Z",
    evidenceRefs: [`source:${evidenceId}`],
    personCanonicalId: `person:${evidenceId}`,
    personLabel: `Person ${evidenceId}`,
    organizationCanonicalId,
    organizationLabel,
    decisionClass: "PARTNERSHIPS"
  };
}

function sponsorshipLink(input: {
  evidenceId: string;
  propertyCanonicalId: string;
  propertyLabel: string;
  sponsorCanonicalId: string;
  sponsorLabel: string;
  truthState?: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
}): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: input.evidenceId,
    opportunityId: OPPORTUNITY_ID,
    kind: "SPONSORSHIP_LINK",
    truthState: input.truthState ?? "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T02:05:00.000Z",
    evidenceRefs: [`source:${input.evidenceId}`],
    propertyCanonicalId: input.propertyCanonicalId,
    propertyLabel: input.propertyLabel,
    sponsorCanonicalId: input.sponsorCanonicalId,
    sponsorLabel: input.sponsorLabel,
    relationshipLabel: "OFFICIAL_SPONSOR"
  };
}

test("distinguishes sponsor-side and property-side decision makers by exact canonical organization id", () => {
  const result = reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [
      decisionMaker("organization:brand", "Brand", "brand-buyer"),
      decisionMaker("organization:property", "Property", "property-buyer"),
      sponsorshipLink({
        evidenceId: "sponsor-link",
        propertyCanonicalId: "organization:property",
        propertyLabel: "Property",
        sponsorCanonicalId: "organization:brand",
        sponsorLabel: "Brand"
      })
    ]
  });

  const brand = result.decisionMakers.find((item) => item.organizationCanonicalId === "organization:brand");
  const property = result.decisionMakers.find((item) => item.organizationCanonicalId === "organization:property");
  assert.equal(brand?.side, "SPONSOR_SIDE");
  assert.equal(property?.side, "PROPERTY_SIDE");
  assert.deepEqual(brand?.matchedSponsorshipEvidenceIds, ["sponsor-link"]);
  assert.deepEqual(property?.matchedSponsorshipEvidenceIds, ["sponsor-link"]);
  assert.equal(result.sponsorSideCount, 1);
  assert.equal(result.propertySideCount, 1);
  assert.equal(result.ambiguousSideCount, 0);
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.verificationRequired, false);
});

test("does not fuzzy-match organization labels when canonical ids do not match", () => {
  const result = reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [
      decisionMaker("organization:brand-crm", "Same Brand", "brand-buyer"),
      sponsorshipLink({
        evidenceId: "sponsor-link",
        propertyCanonicalId: "organization:property",
        propertyLabel: "Property",
        sponsorCanonicalId: "organization:brand-external",
        sponsorLabel: "Same Brand"
      })
    ]
  });

  assert.equal(result.decisionMakers[0]?.side, "UNRESOLVED");
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.verificationRequired, true);
  assert.deepEqual(result.decisionMakers[0]?.matchedSponsorshipEvidenceIds, []);
});

test("marks an organization ambiguous when evidence places the exact organization on both sides", () => {
  const result = reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [
      decisionMaker("organization:shared", "Shared Organization", "shared-buyer"),
      sponsorshipLink({
        evidenceId: "as-sponsor",
        propertyCanonicalId: "organization:property-a",
        propertyLabel: "Property A",
        sponsorCanonicalId: "organization:shared",
        sponsorLabel: "Shared Organization"
      }),
      sponsorshipLink({
        evidenceId: "as-property",
        propertyCanonicalId: "organization:shared",
        propertyLabel: "Shared Organization",
        sponsorCanonicalId: "organization:brand-b",
        sponsorLabel: "Brand B"
      })
    ]
  });

  assert.equal(result.decisionMakers[0]?.side, "AMBIGUOUS_SIDE");
  assert.equal(result.ambiguousSideCount, 1);
  assert.equal(result.verificationRequired, true);
  assert.deepEqual(result.decisionMakers[0]?.matchedSponsorshipEvidenceIds, ["as-property", "as-sponsor"]);
});

test("withheld sponsorship claims cannot establish a decision-maker side", () => {
  const result = reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [
      decisionMaker("organization:brand", "Brand", "brand-buyer"),
      sponsorshipLink({
        evidenceId: "inferred-link",
        propertyCanonicalId: "organization:property",
        propertyLabel: "Property",
        sponsorCanonicalId: "organization:brand",
        sponsorLabel: "Brand",
        truthState: "INFERRED"
      })
    ]
  });

  assert.equal(result.accessMap.sponsorshipLinks.length, 0);
  assert.equal(result.accessMap.withheld[0]?.reason, "INFERRED");
  assert.equal(result.decisionMakers[0]?.side, "UNRESOLVED");
  assert.equal(result.verificationRequired, true);
});

test("preserves provenance without adding confidence contact data or opportunity certainty", () => {
  const result = reviewSponsorDecisionMakerSidesV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [
      decisionMaker("organization:brand", "Brand", "brand-buyer"),
      sponsorshipLink({
        evidenceId: "sponsor-link",
        propertyCanonicalId: "organization:property",
        propertyLabel: "Property",
        sponsorCanonicalId: "organization:brand",
        sponsorLabel: "Brand"
      })
    ]
  });
  const binding = result.decisionMakers[0] ?? {};

  assert.deepEqual((binding as { evidenceRefs?: readonly string[] }).evidenceRefs, [
    "source:brand-buyer",
    "source:sponsor-link"
  ]);
  assert.equal("confidence" in binding, false);
  assert.equal("email" in binding, false);
  assert.equal("phone" in binding, false);
  assert.equal("opportunityCertainty" in binding, false);
  assert.equal("relationshipStrength" in binding, false);
});

test("inherits canonical scope validation and is deterministic", () => {
  assert.throws(
    () => reviewSponsorDecisionMakerSidesV1({
      opportunityId: OPPORTUNITY_ID,
      asOf: AS_OF,
      evidence: [{ ...decisionMaker("organization:brand", "Brand", "buyer"), opportunityId: "opportunity:other" }]
    }),
    /OPPORTUNITY_ACCESS_SCOPE_MISMATCH/
  );

  const evidence = [
    decisionMaker("organization:brand", "Brand", "brand-buyer"),
    sponsorshipLink({
      evidenceId: "sponsor-link",
      propertyCanonicalId: "organization:property",
      propertyLabel: "Property",
      sponsorCanonicalId: "organization:brand",
      sponsorLabel: "Brand"
    })
  ];
  const forward = reviewSponsorDecisionMakerSidesV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence });
  const reverse = reviewSponsorDecisionMakerSidesV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence: [...evidence].reverse() });
  assert.deepEqual(reverse, forward);
});
