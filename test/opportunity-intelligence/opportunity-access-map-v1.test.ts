import assert from "node:assert/strict";
import test from "node:test";

import {
  projectOpportunityAccessMapV1,
  type OpportunityAccessEvidenceV1
} from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

const AS_OF = "2026-09-18T20:00:00.000Z";
const OPPORTUNITY_ID = "opportunity:uw-2027";

function baseEvidence(overrides: Partial<OpportunityAccessEvidenceV1> = {}): OpportunityAccessEvidenceV1 {
  return {
    evidenceId: "evidence:decision-maker:1",
    opportunityId: OPPORTUNITY_ID,
    kind: "DECISION_MAKER",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    observedAt: "2026-09-18T18:00:00.000Z",
    evidenceRefs: ["crm:person:1", "source:official-role-page"],
    personCanonicalId: "person:alex-buyer",
    personLabel: "Alex Buyer",
    organizationCanonicalId: "organization:example-athletics",
    organizationLabel: "Example Athletics",
    decisionClass: "SPONSORSHIP_ACTIVATION",
    ...overrides
  } as OpportunityAccessEvidenceV1;
}

function completeEvidence(): OpportunityAccessEvidenceV1[] {
  return [
    baseEvidence(),
    {
      evidenceId: "evidence:sponsor:1",
      opportunityId: OPPORTUNITY_ID,
      kind: "SPONSORSHIP_LINK",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-18T18:05:00.000Z",
      evidenceRefs: ["source:official-sponsor-announcement"],
      propertyCanonicalId: "organization:example-athletics",
      propertyLabel: "Example Athletics",
      sponsorCanonicalId: "organization:example-brand",
      sponsorLabel: "Example Brand",
      relationshipLabel: "OFFICIAL_SPONSOR"
    },
    {
      evidenceId: "evidence:path:1",
      opportunityId: OPPORTUNITY_ID,
      kind: "WARM_ACCESS_PATH",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-18T18:10:00.000Z",
      evidenceRefs: ["crm:relationship:keegan-to-introducer", "crm:relationship:introducer-to-buyer"],
      path: [
        { entityType: "PERSON", canonicalId: "person:keegan-hall", label: "Keegan Hall" },
        { entityType: "PERSON", canonicalId: "person:introducer", label: "Documented Introducer" },
        { entityType: "PERSON", canonicalId: "person:alex-buyer", label: "Alex Buyer" }
      ],
      reasonForIntroduction: "A documented prior relationship connects the introducer to both parties."
    },
    {
      evidenceId: "evidence:window:1",
      opportunityId: OPPORTUNITY_ID,
      kind: "PLANNING_WINDOW",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-18T18:15:00.000Z",
      evidenceRefs: ["source:documented-planning-calendar"],
      windowType: "SPONSORSHIP_PLANNING",
      windowStart: "2026-10-01T00:00:00.000Z",
      windowEnd: "2026-12-15T23:59:59.000Z",
      whyThisWindow: "The evidenced planning calendar identifies this period for the next cycle."
    }
  ];
}

test("projects only current KNOWN evidence into decision makers sponsors warm paths and planning windows", () => {
  const result = projectOpportunityAccessMapV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: completeEvidence()
  });

  assert.equal(result.decisionMakers.length, 1);
  assert.equal(result.sponsorshipLinks.length, 1);
  assert.equal(result.warmAccessPaths.length, 1);
  assert.equal(result.planningWindows.length, 1);
  assert.deepEqual(result.coverage, {
    DECISION_MAKER: "EVIDENCED",
    SPONSORSHIP_LINK: "EVIDENCED",
    WARM_ACCESS_PATH: "EVIDENCED",
    PLANNING_WINDOW: "EVIDENCED"
  });
  assert.deepEqual(result.researchGaps, []);
  assert.equal(result.verificationRequired, false);
});

test("does not promote inferred unknown stale conflicted or freshness-unknown evidence", () => {
  const evidence: OpportunityAccessEvidenceV1[] = [
    baseEvidence({ evidenceId: "inferred", truthState: "INFERRED" }),
    baseEvidence({ evidenceId: "unknown", truthState: "UNKNOWN" }),
    baseEvidence({ evidenceId: "stale", truthState: "STALE" }),
    baseEvidence({ evidenceId: "conflicted", truthState: "CONFLICTED" }),
    baseEvidence({ evidenceId: "freshness-unknown", freshnessState: "UNKNOWN" })
  ];
  const result = projectOpportunityAccessMapV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence });

  assert.equal(result.decisionMakers.length, 0);
  assert.equal(result.coverage.DECISION_MAKER, "NEEDS_VERIFICATION");
  assert.deepEqual(result.withheld.map((item) => item.reason), ["CONFLICTED", "FRESHNESS_UNKNOWN", "INFERRED", "STALE", "UNKNOWN"]);
  assert.equal(result.verificationRequired, true);
});

test("fails closed on future observations and empty provenance", () => {
  const result = projectOpportunityAccessMapV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [
      baseEvidence({ evidenceId: "future", observedAt: "2026-09-19T00:00:00.000Z" }),
      baseEvidence({ evidenceId: "no-refs", evidenceRefs: [] })
    ]
  });

  assert.equal(result.decisionMakers.length, 0);
  assert.deepEqual(result.withheld.map((item) => item.reason), ["FUTURE_EVIDENCE", "EVIDENCE_MISSING"]);
});

test("treats elapsed planning windows as historical evidence rather than current planning guidance", () => {
  const result = projectOpportunityAccessMapV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [{
      evidenceId: "elapsed-window",
      opportunityId: OPPORTUNITY_ID,
      kind: "PLANNING_WINDOW",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-08-01T00:00:00.000Z",
      evidenceRefs: ["source:calendar"],
      windowType: "SPONSORSHIP_PLANNING",
      windowStart: "2026-08-01T00:00:00.000Z",
      windowEnd: "2026-09-01T00:00:00.000Z",
      whyThisWindow: "Documented historical planning period."
    }]
  });

  assert.equal(result.planningWindows.length, 0);
  assert.equal(result.coverage.PLANNING_WINDOW, "NEEDS_VERIFICATION");
  assert.equal(result.withheld[0]?.reason, "WINDOW_ELAPSED");
});

test("merges corroborating evidence for the same fact without manufacturing confidence", () => {
  const first = baseEvidence({ evidenceId: "dm-a", evidenceRefs: ["source:a"], observedAt: "2026-09-17T18:00:00.000Z" });
  const second = baseEvidence({ evidenceId: "dm-b", evidenceRefs: ["source:b"], observedAt: "2026-09-18T18:00:00.000Z" });
  const result = projectOpportunityAccessMapV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence: [second, first] });

  assert.equal(result.decisionMakers.length, 1);
  assert.deepEqual(result.decisionMakers[0]?.evidenceIds, ["dm-a", "dm-b"]);
  assert.deepEqual(result.decisionMakers[0]?.evidenceRefs, ["source:a", "source:b"]);
  assert.equal(result.decisionMakers[0]?.observedAt, "2026-09-18T18:00:00.000Z");
  assert.equal("confidence" in (result.decisionMakers[0] ?? {}), false);
  assert.equal("score" in (result.decisionMakers[0] ?? {}), false);
});

test("withholds current duplicate facts when their substantive claims conflict", () => {
  const result = projectOpportunityAccessMapV1({
    opportunityId: OPPORTUNITY_ID,
    asOf: AS_OF,
    evidence: [
      baseEvidence({ evidenceId: "dm-a", personLabel: "Alex Buyer" }),
      baseEvidence({ evidenceId: "dm-b", personLabel: "Alex B." })
    ]
  });

  assert.equal(result.decisionMakers.length, 0);
  assert.deepEqual(result.withheld.map((item) => item.reason), ["DUPLICATE_CONFLICT", "DUPLICATE_CONFLICT"]);
  assert.equal(result.coverage.DECISION_MAKER, "NEEDS_VERIFICATION");
});

test("missing categories are research gaps and never claims that the real-world relationship is absent", () => {
  const result = projectOpportunityAccessMapV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence: [baseEvidence()] });

  assert.deepEqual(result.researchGaps, ["SPONSORSHIP_LINK", "WARM_ACCESS_PATH", "PLANNING_WINDOW"]);
  assert.equal(result.coverage.SPONSORSHIP_LINK, "MISSING");
  assert.equal(result.coverage.WARM_ACCESS_PATH, "MISSING");
  assert.equal(result.coverage.PLANNING_WINDOW, "MISSING");
});

test("scope mismatches and malformed paths fail closed", () => {
  assert.throws(
    () => projectOpportunityAccessMapV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence: [baseEvidence({ opportunityId: "other" })] }),
    /OPPORTUNITY_ACCESS_SCOPE_MISMATCH/
  );

  assert.throws(
    () => projectOpportunityAccessMapV1({
      opportunityId: OPPORTUNITY_ID,
      asOf: AS_OF,
      evidence: [{
        evidenceId: "bad-path",
        opportunityId: OPPORTUNITY_ID,
        kind: "WARM_ACCESS_PATH",
        truthState: "KNOWN",
        freshnessState: "CURRENT",
        observedAt: "2026-09-18T18:00:00.000Z",
        evidenceRefs: ["source:path"],
        path: [{ entityType: "PERSON", canonicalId: "person:keegan-hall", label: "Keegan Hall" }],
        reasonForIntroduction: "Only one node is not a path."
      }]
    }),
    /OPPORTUNITY_ACCESS_PATH_INVALID/
  );
});

test("output ordering is deterministic regardless of evidence input order", () => {
  const evidence = completeEvidence();
  const forward = projectOpportunityAccessMapV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence });
  const reverse = projectOpportunityAccessMapV1({ opportunityId: OPPORTUNITY_ID, asOf: AS_OF, evidence: [...evidence].reverse() });
  assert.deepEqual(reverse, forward);
});
