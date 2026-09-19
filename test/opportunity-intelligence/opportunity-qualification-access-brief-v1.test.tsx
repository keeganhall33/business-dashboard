import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpportunityQualificationAccessBriefV1
} from "@/lib/opportunity-intelligence/opportunity-qualification-access-brief-v1";
import {
  projectOpportunityAccessMapV1,
  type OpportunityAccessEvidenceV1,
  type OpportunityAccessMapV1
} from "@/lib/opportunity-intelligence/opportunity-access-map-v1";
import {
  assessOpportunityQualificationReadinessV1,
  type OpportunityQualificationReadinessResultV1
} from "@/lib/relationship-intelligence/opportunity-qualification-readiness-v1";
import {
  normalizeOpportunitySignalsV1,
  type OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

const OPPORTUNITY = "opportunity:partner-a";
const ORG = "org:brand-a";
const PERSON = "person:buyer-a";
const INTAKE_AT = "2026-09-18T17:30:00.000Z";
const QUALIFICATION_AT = "2026-09-18T17:35:00.000Z";
const ACCESS_AT = "2026-09-18T17:40:00.000Z";
const REVIEW_AT = "2026-09-18T17:45:00.000Z";

function observation(overrides: Partial<OpportunitySourceObservationV1> = {}): OpportunitySourceObservationV1 {
  return {
    captureId: "capture:boardroom:access-brief:1",
    sourceKind: "BOARDROOM",
    sourceEventKey: "boardroom:event:access-brief:1",
    sourceRef: "boardroom:story:access-brief:1",
    observedAt: "2026-09-18T17:00:00.000Z",
    evidenceRefs: ["evidence:signal:1"],
    truthState: "KNOWN",
    signalType: "PARTNERSHIP_OPPORTUNITY",
    organizationRef: ORG,
    personRef: PERSON,
    opportunityRef: OPPORTUNITY,
    ...overrides
  };
}

function qualification(observations: readonly OpportunitySourceObservationV1[] = [observation()]): OpportunityQualificationReadinessResultV1 {
  const intake = normalizeOpportunitySignalsV1({ evaluatedAt: INTAKE_AT, observations });
  return assessOpportunityQualificationReadinessV1({ evaluatedAt: QUALIFICATION_AT, intake });
}

function accessEvidence(): OpportunityAccessEvidenceV1[] {
  return [
    {
      evidenceId: "access:decision-maker:1",
      opportunityId: OPPORTUNITY,
      kind: "DECISION_MAKER",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-18T17:10:00.000Z",
      evidenceRefs: ["evidence:official-role"],
      personCanonicalId: PERSON,
      personLabel: "Documented Buyer",
      organizationCanonicalId: ORG,
      organizationLabel: "Brand A",
      decisionClass: "PARTNERSHIPS"
    },
    {
      evidenceId: "access:sponsor:1",
      opportunityId: OPPORTUNITY,
      kind: "SPONSORSHIP_LINK",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-18T17:12:00.000Z",
      evidenceRefs: ["evidence:official-partnership"],
      propertyCanonicalId: "org:property-a",
      propertyLabel: "Property A",
      sponsorCanonicalId: ORG,
      sponsorLabel: "Brand A",
      relationshipLabel: "OFFICIAL_PARTNER"
    },
    {
      evidenceId: "access:path:1",
      opportunityId: OPPORTUNITY,
      kind: "WARM_ACCESS_PATH",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-18T17:14:00.000Z",
      evidenceRefs: ["evidence:crm-path-a", "evidence:crm-path-b"],
      path: [
        { entityType: "PERSON", canonicalId: "person:keegan-hall", label: "Keegan Hall" },
        { entityType: "PERSON", canonicalId: "person:introducer-a", label: "Documented Introducer" },
        { entityType: "PERSON", canonicalId: PERSON, label: "Documented Buyer" }
      ],
      reasonForIntroduction: "Existing canonical relationship evidence supports this path."
    },
    {
      evidenceId: "access:window:1",
      opportunityId: OPPORTUNITY,
      kind: "PLANNING_WINDOW",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      observedAt: "2026-09-18T17:16:00.000Z",
      evidenceRefs: ["evidence:planning-calendar"],
      windowType: "PARTNERSHIP_PLANNING",
      windowStart: "2026-10-01T00:00:00.000Z",
      windowEnd: "2026-12-15T23:59:59.000Z",
      whyThisWindow: "The documented planning evidence identifies this period."
    }
  ];
}

function accessMap(evidence: readonly OpportunityAccessEvidenceV1[] = accessEvidence()): OpportunityAccessMapV1 {
  return projectOpportunityAccessMapV1({ opportunityId: OPPORTUNITY, asOf: ACCESS_AT, evidence });
}

function build(
  qualificationResult: OpportunityQualificationReadinessResultV1 = qualification(),
  maps: readonly OpportunityAccessMapV1[] = [accessMap()],
  overrides: Partial<Parameters<typeof buildOpportunityQualificationAccessBriefV1>[0]> = {}
) {
  return buildOpportunityQualificationAccessBriefV1({
    evaluatedAt: REVIEW_AT,
    qualification: qualificationResult,
    accessMaps: maps,
    maximumQualificationAgeMinutes: 60,
    maximumAccessMapAgeMinutes: 60,
    ...overrides
  });
}

test("joins exact canonical opportunity qualification to evidenced access intelligence for internal review", () => {
  const result = build();
  assert.equal(result.status, "READY");
  assert.equal(result.decisions.length, 1);

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(decision.canonicalOpportunityRef, OPPORTUNITY);
  assert.equal(decision.accessMapAsOf, ACCESS_AT);
  assert.equal(decision.decisionMakers.length, 1);
  assert.equal(decision.sponsorshipLinks.length, 1);
  assert.equal(decision.warmAccessPaths.length, 1);
  assert.equal(decision.planningWindows.length, 1);
  assert.deepEqual(decision.accessResearchGaps, []);
  assert.equal(decision.accessVerificationRequired, false);
  assert.ok(decision.evidenceRefs.includes("evidence:signal:1"));
  assert.ok(decision.evidenceRefs.includes("evidence:official-role"));
  assert.equal(decision.qualificationOutcome, "NOT_ESTABLISHED");
  assert.equal(decision.opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(decision.dealLikelihood, "NOT_ESTABLISHED");
  assert.equal(decision.confidence, "NOT_ESTABLISHED");
  assert.equal(decision.monetaryValue, null);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("requires an exact opportunity access map rather than joining by organization person or prose", () => {
  const otherMap = projectOpportunityAccessMapV1({
    opportunityId: "opportunity:other",
    asOf: ACCESS_AT,
    evidence: accessEvidence().map((item) => ({ ...item, opportunityId: "opportunity:other" })) as OpportunityAccessEvidenceV1[]
  });
  const result = build(qualification(), [otherMap]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "RESEARCH_REQUIRED");
  assert.equal(decision.accessMapAsOf, null);
  assert.equal(decision.decisionMakers.length, 0);
  assert.ok(decision.reasonCodes.includes("EXACT_OPPORTUNITY_ACCESS_MAP_REQUIRED"));
});

test("keeps valid partial access evidence visible while preserving explicit research gaps", () => {
  const partial = accessMap([accessEvidence()[0]]);
  const result = build(qualification(), [partial]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(decision.decisionMakers.length, 1);
  assert.deepEqual(decision.accessResearchGaps, ["SPONSORSHIP_LINK", "WARM_ACCESS_PATH", "PLANNING_WINDOW"]);
  assert.ok(decision.reasonCodes.includes("ACCESS_MAP_HAS_EXPLICIT_RESEARCH_GAPS"));
  assert.equal(decision.sponsorInterest, "NOT_ESTABLISHED");
});

test("withheld or conflicted access evidence requires verification and is never promoted", () => {
  const conflicted = accessMap([
    accessEvidence()[0],
    { ...accessEvidence()[0], evidenceId: "access:decision-maker:2", personLabel: "Different Label" } as OpportunityAccessEvidenceV1
  ]);
  const result = build(qualification(), [conflicted]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "VERIFY_REQUIRED");
  assert.equal(decision.decisionMakers.length, 0);
  assert.equal(decision.accessVerificationRequired, true);
  assert.ok(decision.reasonCodes.includes("ACCESS_MAP_CONTAINS_WITHHELD_EVIDENCE_REQUIRING_VERIFICATION"));
});

test("stale access evidence returns to research and future access chronology fails to verification", () => {
  const current = accessMap();
  const stale = build(qualification(), [current], {
    evaluatedAt: "2026-09-18T20:00:00.000Z",
    maximumAccessMapAgeMinutes: 60,
    maximumQualificationAgeMinutes: 180
  });
  assert.equal(stale.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(stale.decisions[0].reasonCodes.includes("ACCESS_MAP_STALE"));
  assert.equal(stale.decisions[0].decisionMakers.length, 0);

  const future = { ...current, asOf: "2026-09-18T18:00:00.000Z" } as OpportunityAccessMapV1;
  const futureResult = build(qualification(), [future]);
  assert.equal(futureResult.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(futureResult.decisions[0].reasonCodes.includes("ACCESS_MAP_IN_FUTURE"));
});

test("preserves upstream context research verification and suppression without laundering them through access evidence", () => {
  const context = qualification([observation({ signalType: "WARM_INTRO" })]);
  const research = qualification([observation({ truthState: "PARTIAL" })]);
  const verify = qualification([observation({
    evidenceRefs: ["evidence:signal:1"],
    warmAccessClaim: { state: "SUPPORTED", evidenceRefs: ["evidence:not-in-lineage"] }
  })]);
  const suppress = qualification([observation({ signalType: "NONE" })]);

  assert.equal(build(context).decisions[0].disposition, "CONTEXT_ONLY");
  assert.equal(build(research).decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(build(verify).decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(build(suppress).decisions[0].disposition, "SUPPRESS");
});

test("blocks duplicate access maps instead of arbitrarily choosing one", () => {
  const map = accessMap();
  const result = build(qualification(), [map, map]);

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.decisions, []);
  assert.ok(result.issues.includes("DUPLICATE_ACCESS_MAP_FOR_CANONICAL_OPPORTUNITY"));
});

test("blocks stale qualification projection before joining any access evidence", () => {
  const result = build(qualification(), [accessMap()], {
    evaluatedAt: "2026-09-18T20:00:00.000Z",
    maximumQualificationAgeMinutes: 60,
    maximumAccessMapAgeMinutes: 180
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("QUALIFICATION_STALE"));
  assert.deepEqual(result.decisions, []);
});

test("blocks widened upstream authority rather than inheriting unsafe mutation capability", () => {
  const clean = qualification();
  const tampered = {
    ...clean,
    authority: { ...clean.authority, outreachAuthorized: true }
  } as unknown as OpportunityQualificationReadinessResultV1;
  const result = build(tampered, [accessMap()]);

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("QUALIFICATION_AUTHORITY_WIDENED"));
  assert.equal(result.authority.outreachAuthorized, false);
});

test("detects forged access-map aggregate semantics and fails the candidate to verification", () => {
  const clean = accessMap();
  const tampered = {
    ...clean,
    coverage: { ...clean.coverage, DECISION_MAKER: "MISSING" }
  } as OpportunityAccessMapV1;
  const result = build(qualification(), [tampered]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "VERIFY_REQUIRED");
  assert.ok(decision.reasonCodes.includes("ACCESS_MAP_COVERAGE_MISMATCH"));
  assert.equal(decision.decisionMakers.length, 0);
});

test("does not mutate qualification or access-map inputs", () => {
  const q = qualification();
  const map = accessMap();
  const qBefore = JSON.stringify(q);
  const mapBefore = JSON.stringify(map);

  const result = build(q, [map]);
  assert.equal(JSON.stringify(q), qBefore);
  assert.equal(JSON.stringify(map), mapBefore);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.decisions[0]), true);
});
