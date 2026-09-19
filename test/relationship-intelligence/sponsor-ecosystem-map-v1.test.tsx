import assert from "node:assert/strict";
import test from "node:test";

import { buildSponsorEcosystemMapV1 } from "../../src/lib/relationship-intelligence/sponsor-ecosystem-map-v1";
import type { OpportunityAccessMapV1 } from "../../src/lib/opportunity-intelligence/opportunity-access-map-v1";

const AS_OF = "2026-09-19T08:00:00.000Z";

function accessMap(overrides: Partial<OpportunityAccessMapV1> = {}): OpportunityAccessMapV1 {
  return {
    opportunityId: "opp:uw-brand-2027",
    asOf: AS_OF,
    decisionMakers: [
      {
        evidenceIds: ["dm:property"],
        observedAt: "2026-09-18T12:00:00.000Z",
        evidenceRefs: ["source:uw"],
        personCanonicalId: "person:property",
        personLabel: "Property Buyer",
        organizationCanonicalId: "org:uw",
        organizationLabel: "UW Athletics",
        decisionClass: "PARTNERSHIPS"
      },
      {
        evidenceIds: ["dm:sponsor"],
        observedAt: "2026-09-18T13:00:00.000Z",
        evidenceRefs: ["source:brand"],
        personCanonicalId: "person:sponsor",
        personLabel: "Sponsor Buyer",
        organizationCanonicalId: "org:brand",
        organizationLabel: "Brand Co",
        decisionClass: "SPORTS_MARKETING"
      },
      {
        evidenceIds: ["dm:agency"],
        observedAt: "2026-09-18T14:00:00.000Z",
        evidenceRefs: ["source:agency"],
        personCanonicalId: "person:agency",
        personLabel: "Agency Contact",
        organizationCanonicalId: "org:agency",
        organizationLabel: "Agency Co",
        decisionClass: "ACCOUNT_LEAD"
      }
    ],
    sponsorshipLinks: [
      {
        evidenceIds: ["sponsor:1"],
        observedAt: "2026-09-18T10:00:00.000Z",
        evidenceRefs: ["source:sponsorship"],
        propertyCanonicalId: "org:uw",
        propertyLabel: "UW Athletics",
        sponsorCanonicalId: "org:brand",
        sponsorLabel: "Brand Co",
        relationshipLabel: "OFFICIAL_SPONSOR"
      }
    ],
    warmAccessPaths: [
      {
        evidenceIds: ["path:sponsor"],
        observedAt: "2026-09-18T15:00:00.000Z",
        evidenceRefs: ["source:intro"],
        path: [
          { entityType: "PERSON", canonicalId: "person:keegan", label: "Keegan" },
          { entityType: "PERSON", canonicalId: "person:sponsor", label: "Sponsor Buyer" }
        ],
        reasonForIntroduction: "Observed prior introduction path"
      },
      {
        evidenceIds: ["path:agency"],
        observedAt: "2026-09-18T16:00:00.000Z",
        evidenceRefs: ["source:agency-path"],
        path: [
          { entityType: "PERSON", canonicalId: "person:keegan", label: "Keegan" },
          { entityType: "PERSON", canonicalId: "person:agency", label: "Agency Contact" }
        ],
        reasonForIntroduction: "Observed agency path"
      },
      {
        evidenceIds: ["path:org"],
        observedAt: "2026-09-18T16:30:00.000Z",
        evidenceRefs: ["source:org-path"],
        path: [
          { entityType: "PERSON", canonicalId: "person:keegan", label: "Keegan" },
          { entityType: "COMPANY", canonicalId: "org:brand", label: "Brand Co" }
        ],
        reasonForIntroduction: "Observed organization path"
      }
    ],
    planningWindows: [
      {
        evidenceIds: ["window:1"],
        observedAt: "2026-09-18T17:00:00.000Z",
        evidenceRefs: ["source:planning"],
        windowType: "SPONSOR_RENEWAL",
        windowStart: "2026-12-01T00:00:00.000Z",
        windowEnd: "2027-01-31T23:59:59.000Z",
        whyThisWindow: "Explicitly documented renewal window"
      }
    ],
    coverage: {
      DECISION_MAKER: "EVIDENCED",
      SPONSORSHIP_LINK: "EVIDENCED",
      WARM_ACCESS_PATH: "EVIDENCED",
      PLANNING_WINDOW: "EVIDENCED"
    },
    researchGaps: [],
    withheld: [],
    verificationRequired: false,
    ...overrides
  };
}

test("builds a sponsor ecosystem only from exact projected sponsorship evidence", () => {
  const result = buildSponsorEcosystemMapV1({ accessMaps: [accessMap()], asOf: AS_OF });

  assert.equal(result.ecosystems.length, 1);
  const ecosystem = result.ecosystems[0];
  assert.equal(ecosystem.propertyCanonicalId, "org:uw");
  assert.equal(ecosystem.sponsorCanonicalId, "org:brand");
  assert.deepEqual(ecosystem.opportunityIds, ["opp:uw-brand-2027"]);
  assert.deepEqual(ecosystem.evidenceRefs, ["source:sponsorship"]);
  assert.deepEqual(ecosystem.decisionMakers.map((person) => [person.side, person.personCanonicalId]), [
    ["PROPERTY", "person:property"],
    ["SPONSOR", "person:sponsor"]
  ]);
  assert.equal(ecosystem.decisionMakers.some((person) => person.personCanonicalId === "person:agency"), false);
});

test("carries a warm path only when its exact terminal person is an evidenced buyer on the mapped side", () => {
  const result = buildSponsorEcosystemMapV1({ accessMaps: [accessMap()], asOf: AS_OF });
  const paths = result.ecosystems[0].warmAccessPaths;

  assert.equal(paths.length, 1);
  assert.equal(paths[0].targetPersonCanonicalId, "person:sponsor");
  assert.equal(paths[0].targetSide, "SPONSOR");
  assert.deepEqual(paths[0].evidenceRefs, ["source:intro"]);
});

test("preserves explicit planning windows without deriving outreach timing", () => {
  const result = buildSponsorEcosystemMapV1({ accessMaps: [accessMap()], asOf: AS_OF });
  const window = result.ecosystems[0].planningWindows[0];

  assert.equal(window.windowType, "SPONSOR_RENEWAL");
  assert.equal(window.windowStart, "2026-12-01T00:00:00.000Z");
  assert.equal(window.windowEnd, "2027-01-31T23:59:59.000Z");
  assert.equal(result.inferredPlanningTiming, false);
});

test("merges the same exact sponsor relationship across opportunities while retaining provenance", () => {
  const second = accessMap({
    opportunityId: "opp:uw-brand-charity",
    sponsorshipLinks: [{
      ...accessMap().sponsorshipLinks[0],
      evidenceIds: ["sponsor:2"],
      observedAt: "2026-09-19T06:00:00.000Z",
      evidenceRefs: ["source:second"]
    }],
    decisionMakers: [],
    warmAccessPaths: [],
    planningWindows: [],
    coverage: {
      DECISION_MAKER: "MISSING",
      SPONSORSHIP_LINK: "EVIDENCED",
      WARM_ACCESS_PATH: "MISSING",
      PLANNING_WINDOW: "MISSING"
    }
  });

  const result = buildSponsorEcosystemMapV1({ accessMaps: [second, accessMap()], asOf: AS_OF });
  assert.equal(result.ecosystems.length, 1);
  assert.deepEqual(result.ecosystems[0].opportunityIds, ["opp:uw-brand-2027", "opp:uw-brand-charity"]);
  assert.deepEqual(result.ecosystems[0].evidenceRefs, ["source:second", "source:sponsorship"]);
  assert.equal(result.ecosystems[0].observedAt, "2026-09-19T06:00:00.000Z");
});

test("fails closed when projected facts claim evidence that the upstream coverage state does not support", () => {
  assert.throws(
    () => buildSponsorEcosystemMapV1({
      accessMaps: [accessMap({ coverage: { ...accessMap().coverage, SPONSORSHIP_LINK: "NEEDS_VERIFICATION" } })],
      asOf: AS_OF
    }),
    /sponsorship links are not fully evidenced/
  );

  assert.throws(
    () => buildSponsorEcosystemMapV1({
      accessMaps: [accessMap({ coverage: { ...accessMap().coverage, DECISION_MAKER: "NEEDS_VERIFICATION" } })],
      asOf: AS_OF
    }),
    /decision makers are not fully evidenced/
  );
});

test("requires one exact snapshot time and rejects future-dated projected evidence", () => {
  assert.throws(
    () => buildSponsorEcosystemMapV1({ accessMaps: [accessMap({ asOf: "2026-09-19T07:59:59.000Z" })], asOf: AS_OF }),
    /must exactly match asOf/
  );

  const future = accessMap({
    sponsorshipLinks: [{ ...accessMap().sponsorshipLinks[0], observedAt: "2026-09-19T09:00:00.000Z" }]
  });
  assert.throws(
    () => buildSponsorEcosystemMapV1({ accessMaps: [future], asOf: AS_OF }),
    /cannot be after asOf/
  );
});

test("rejects duplicate opportunity snapshots and sponsorship self-links", () => {
  assert.throws(
    () => buildSponsorEcosystemMapV1({ accessMaps: [accessMap(), accessMap()], asOf: AS_OF }),
    /duplicate opportunity access map/
  );

  const selfLink = accessMap({
    sponsorshipLinks: [{
      ...accessMap().sponsorshipLinks[0],
      sponsorCanonicalId: "org:uw",
      sponsorLabel: "UW Athletics"
    }]
  });
  assert.throws(
    () => buildSponsorEcosystemMapV1({ accessMaps: [selfLink], asOf: AS_OF }),
    /cannot be a self-link/
  );
});

test("exposes no inferred relationships, contact data, timing, or side effects", () => {
  const result = buildSponsorEcosystemMapV1({ accessMaps: [accessMap()], asOf: AS_OF });

  assert.equal(result.inferredSponsorshipLinks, false);
  assert.equal(result.inferredDecisionAuthority, false);
  assert.equal(result.inferredWarmAccess, false);
  assert.equal(result.inferredContactInfo, false);
  assert.equal(result.inferredPlanningTiming, false);
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.externalResearchPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.deepEqual(result.counts, {
    opportunitiesReviewed: 1,
    sponsorLinks: 1,
    propertyDecisionMakers: 1,
    sponsorDecisionMakers: 1,
    exactWarmAccessPaths: 1,
    explicitPlanningWindows: 1
  });
});
