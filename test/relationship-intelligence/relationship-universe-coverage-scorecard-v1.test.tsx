import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipUniverseCoverageScorecardV1,
  type RelationshipUniverseCoverageSubjectInputV1
} from "@/lib/relationship-intelligence/relationship-universe-coverage-scorecard-v1";
import type { OpportunityAccessEvidenceV1 } from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

const AS_OF = "2026-09-19T02:00:00.000Z";

function decisionMaker(
  opportunityId: string,
  overrides: Partial<OpportunityAccessEvidenceV1> = {}
): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: `evidence:${opportunityId}:decision-maker`,
    opportunityId,
    kind: "DECISION_MAKER",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-19T01:00:00.000Z",
    evidenceRefs: ["source:official-role-page"],
    personCanonicalId: `person:${opportunityId}:buyer`,
    personLabel: "Documented Buyer",
    organizationCanonicalId: `organization:${opportunityId}`,
    organizationLabel: "Documented Organization",
    decisionClass: "PARTNERSHIPS",
    ...overrides
  } as OpportunityAccessEvidenceV1;
}

function completeEvidence(opportunityId: string): OpportunityAccessEvidenceV1[] {
  return [
    decisionMaker(opportunityId),
    {
      evidenceId: `evidence:${opportunityId}:sponsor`,
      opportunityId,
      kind: "SPONSORSHIP_LINK",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-19T01:05:00.000Z",
      evidenceRefs: ["source:official-sponsorship-announcement"],
      propertyCanonicalId: `organization:${opportunityId}`,
      propertyLabel: "Documented Property",
      sponsorCanonicalId: `organization:${opportunityId}:sponsor`,
      sponsorLabel: "Documented Sponsor",
      relationshipLabel: "OFFICIAL_SPONSOR"
    },
    {
      evidenceId: `evidence:${opportunityId}:path`,
      opportunityId,
      kind: "WARM_ACCESS_PATH",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-19T01:10:00.000Z",
      evidenceRefs: ["crm:relationship:one", "crm:relationship:two"],
      path: [
        { entityType: "PERSON", canonicalId: "person:keegan-hall", label: "Keegan Hall" },
        { entityType: "PERSON", canonicalId: "person:documented-introducer", label: "Documented Introducer" },
        { entityType: "PERSON", canonicalId: `person:${opportunityId}:buyer`, label: "Documented Buyer" }
      ],
      reasonForIntroduction: "The path is backed by canonical relationship evidence."
    },
    {
      evidenceId: `evidence:${opportunityId}:window`,
      opportunityId,
      kind: "PLANNING_WINDOW",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-19T01:15:00.000Z",
      evidenceRefs: ["source:documented-planning-calendar"],
      windowType: "SPONSORSHIP_PLANNING",
      windowStart: "2026-10-01T00:00:00.000Z",
      windowEnd: "2026-12-31T23:59:59.000Z",
      whyThisWindow: "A documented planning calendar identifies this period."
    }
  ];
}

function subject(
  overrides: Partial<RelationshipUniverseCoverageSubjectInputV1> = {}
): RelationshipUniverseCoverageSubjectInputV1 {
  const opportunityId = overrides.opportunityId ?? "opportunity:college-one";
  return {
    subjectId: "subject:college-one",
    subjectLabel: "College One",
    domain: "COLLEGE_ATHLETICS",
    priorityTier: "TIER_1",
    opportunityId,
    scopeEvidenceRefs: ["crm:account:college-one"],
    accessEvidence: completeEvidence(opportunityId),
    ...overrides
  };
}

test("aggregates evidence-bounded access coverage by domain and priority tier", () => {
  const result = buildRelationshipUniverseCoverageScorecardV1({
    asOf: AS_OF,
    subjects: [
      subject(),
      subject({
        subjectId: "subject:brand-one",
        subjectLabel: "Brand One",
        domain: "BRANDS_CORPORATE",
        priorityTier: "TIER_2",
        opportunityId: "opportunity:brand-one",
        scopeEvidenceRefs: ["crm:account:brand-one"],
        accessEvidence: []
      })
    ]
  });

  assert.equal(result.totalSubjects, 2);
  assert.equal(result.subjectsWithObservedAccessEvidence, 1);
  assert.equal(result.subjectsWithEvidencedAccess, 1);
  assert.equal(result.groups.length, 2);

  const college = result.groups.find((group) => group.domain === "COLLEGE_ATHLETICS");
  assert.ok(college);
  assert.equal(college.priorityTier, "TIER_1");
  assert.equal(college.subjectCount, 1);
  assert.equal(college.accessCoverage.DECISION_MAKER.EVIDENCED, 1);
  assert.equal(college.accessCoverage.SPONSORSHIP_LINK.EVIDENCED, 1);
  assert.equal(college.accessCoverage.WARM_ACCESS_PATH.EVIDENCED, 1);
  assert.equal(college.accessCoverage.PLANNING_WINDOW.EVIDENCED, 1);
  assert.equal(college.researchGapCount, 0);

  const brand = result.groups.find((group) => group.domain === "BRANDS_CORPORATE");
  assert.ok(brand);
  assert.equal(brand.accessCoverage.DECISION_MAKER.MISSING, 1);
  assert.equal(brand.accessCoverage.SPONSORSHIP_LINK.MISSING, 1);
  assert.equal(brand.accessCoverage.WARM_ACCESS_PATH.MISSING, 1);
  assert.equal(brand.accessCoverage.PLANNING_WINDOW.MISSING, 1);
  assert.equal(brand.researchGapCount, 4);
});

test("turns missing evidence into explicit research gaps without claiming real-world absence", () => {
  const result = buildRelationshipUniverseCoverageScorecardV1({
    asOf: AS_OF,
    subjects: [subject({ accessEvidence: [] })]
  });

  assert.equal(result.researchQueue.length, 4);
  assert.deepEqual(
    result.researchQueue.map((gap) => [gap.kind, gap.coverageState]),
    [
      ["DECISION_MAKER", "MISSING"],
      ["SPONSORSHIP_LINK", "MISSING"],
      ["WARM_ACCESS_PATH", "MISSING"],
      ["PLANNING_WINDOW", "MISSING"]
    ]
  );
  assert.deepEqual(result.researchQueue[0]?.scopeEvidenceRefs, ["crm:account:college-one"]);
  assert.equal("relationshipAbsent" in (result.researchQueue[0] ?? {}), false);
  assert.equal("opportunityCertainty" in (result.researchQueue[0] ?? {}), false);
  assert.equal("confidence" in (result.researchQueue[0] ?? {}), false);
});

test("keeps stale or inferred access evidence in verification rather than promoting it", () => {
  const result = buildRelationshipUniverseCoverageScorecardV1({
    asOf: AS_OF,
    subjects: [
      subject({
        accessEvidence: [
          decisionMaker("opportunity:college-one", {
            evidenceId: "stale-role",
            truthState: "STALE"
          }),
          decisionMaker("opportunity:college-one", {
            evidenceId: "inferred-role",
            truthState: "INFERRED"
          })
        ]
      })
    ]
  });

  assert.equal(result.subjectsWithObservedAccessEvidence, 1);
  assert.equal(result.subjectsWithEvidencedAccess, 0);
  assert.equal(result.subjectsNeedingVerification, 1);
  assert.equal(result.groups[0]?.accessCoverage.DECISION_MAKER.NEEDS_VERIFICATION, 1);
  assert.equal(result.researchQueue[0]?.coverageState, "NEEDS_VERIFICATION");
  assert.deepEqual(
    result.subjects[0]?.accessMap.withheld.map((item) => item.reason),
    ["INFERRED", "STALE"]
  );
});

test("reuses the canonical access projection to withhold future evidence", () => {
  const result = buildRelationshipUniverseCoverageScorecardV1({
    asOf: AS_OF,
    subjects: [
      subject({
        accessEvidence: [
          decisionMaker("opportunity:college-one", {
            observedAt: "2026-09-20T00:00:00.000Z"
          })
        ]
      })
    ]
  });

  assert.equal(result.subjectsWithEvidencedAccess, 0);
  assert.equal(result.subjectsNeedingVerification, 1);
  assert.equal(result.subjects[0]?.accessMap.withheld[0]?.reason, "FUTURE_EVIDENCE");
  assert.equal(result.researchQueue[0]?.coverageState, "NEEDS_VERIFICATION");
});

test("fails closed on scope mismatches duplicate subjects and missing scope provenance", () => {
  assert.throws(
    () => buildRelationshipUniverseCoverageScorecardV1({
      asOf: AS_OF,
      subjects: [subject({ accessEvidence: [decisionMaker("opportunity:other")] })]
    }),
    /OPPORTUNITY_ACCESS_SCOPE_MISMATCH/
  );

  assert.throws(
    () => buildRelationshipUniverseCoverageScorecardV1({
      asOf: AS_OF,
      subjects: [subject(), subject()]
    }),
    /RELATIONSHIP_UNIVERSE_DUPLICATE_SUBJECT_ID/
  );

  assert.throws(
    () => buildRelationshipUniverseCoverageScorecardV1({
      asOf: AS_OF,
      subjects: [subject({ scopeEvidenceRefs: [] })]
    }),
    /RELATIONSHIP_UNIVERSE_SCOPE_EVIDENCE_REFS_REQUIRED/
  );
});

test("orders scorecard groups subjects and research work deterministically", () => {
  const inputs = [
    subject({
      subjectId: "subject:music",
      subjectLabel: "Music Target",
      domain: "MUSIC",
      priorityTier: "TIER_2",
      opportunityId: "opportunity:music",
      scopeEvidenceRefs: ["source:music-scope"],
      accessEvidence: []
    }),
    subject({ accessEvidence: [decisionMaker("opportunity:college-one")] })
  ];

  const forward = buildRelationshipUniverseCoverageScorecardV1({ asOf: AS_OF, subjects: inputs });
  const reverse = buildRelationshipUniverseCoverageScorecardV1({ asOf: AS_OF, subjects: [...inputs].reverse() });
  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.groups.map((group) => [group.priorityTier, group.domain]), [
    ["TIER_1", "COLLEGE_ATHLETICS"],
    ["TIER_2", "MUSIC"]
  ]);
});
