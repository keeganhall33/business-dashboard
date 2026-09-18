import assert from "node:assert/strict";
import test from "node:test";

import {
  compileEvidenceBackedPlanningRadarV1,
  type EvidenceBackedPlanningRadarInputV1,
  type PlanningDateEvidenceRecordV1,
  type PlanningLeadTimeEvidenceRecordV1
} from "../../src/lib/relationship-intelligence/evidence-backed-planning-radar-v1";

const NOW = "2026-09-18T21:00:00.000Z";
const ORG = "org:uw-athletics";
const OPPORTUNITY = "opportunity:uw-sponsor-2027";

function planningWindow(overrides: Partial<PlanningDateEvidenceRecordV1> = {}): PlanningDateEvidenceRecordV1 {
  return {
    evidenceId: "planning:official-window",
    kind: "PLANNING_WINDOW",
    sourceClass: "OFFICIAL_ORGANIZATION_SOURCE",
    canonicalOrganizationRef: ORG,
    canonicalOpportunityRef: OPPORTUNITY,
    observedAt: "2026-09-18T19:00:00.000Z",
    state: "KNOWN",
    evidenceRefs: ["source:official-sponsorship-deck"],
    startDate: "2026-12-01T00:00:00.000Z",
    endDate: "2027-01-31T23:59:59.000Z",
    ...overrides
  };
}

function activationWindow(overrides: Partial<PlanningDateEvidenceRecordV1> = {}): PlanningDateEvidenceRecordV1 {
  return {
    evidenceId: "activation:official-season",
    kind: "ACTIVATION_WINDOW",
    sourceClass: "PUBLIC_PRIMARY_SOURCE",
    canonicalOrganizationRef: ORG,
    canonicalOpportunityRef: OPPORTUNITY,
    observedAt: "2026-09-18T19:30:00.000Z",
    state: "KNOWN",
    evidenceRefs: ["source:official-2027-schedule"],
    startDate: "2027-09-01T00:00:00.000Z",
    endDate: "2027-12-31T23:59:59.000Z",
    ...overrides
  };
}

function engagementLead(overrides: Partial<PlanningLeadTimeEvidenceRecordV1> = {}): PlanningLeadTimeEvidenceRecordV1 {
  return {
    evidenceId: "lead:official-buying-cycle",
    kind: "ENGAGEMENT_LEAD_TIME",
    sourceClass: "AUTHORIZED_FIRST_PARTY",
    canonicalOrganizationRef: ORG,
    canonicalOpportunityRef: OPPORTUNITY,
    observedAt: "2026-09-18T20:00:00.000Z",
    state: "KNOWN",
    evidenceRefs: ["source:first-party-planning-note"],
    minDays: 180,
    maxDays: 270,
    ...overrides
  };
}

function input(overrides: Partial<EvidenceBackedPlanningRadarInputV1> = {}): EvidenceBackedPlanningRadarInputV1 {
  return {
    candidateId: OPPORTUNITY,
    canonicalOrganizationRef: ORG,
    canonicalOpportunityRef: OPPORTUNITY,
    evidence: [planningWindow()],
    evaluatedAt: NOW,
    maximumEvidenceAgeDays: 30,
    ...overrides
  };
}

test("turns explicit official planning evidence into an early-planning radar decision without widening authority", () => {
  const result = compileEvidenceBackedPlanningRadarV1(input());

  assert.equal(result.status, "READY");
  assert.equal(result.decision?.disposition, "PLAN_AHEAD");
  assert.equal(result.decision?.derivation, "EXPLICIT_PLANNING_WINDOW");
  assert.deepEqual(result.decision?.idealOutreachDateRange, {
    startDate: "2026-12-01T00:00:00.000Z",
    endDate: "2027-01-31T23:59:59.000Z"
  });
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.opportunityLikelihood, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.relationshipInferenceAuthorized, false);
  assert.equal(result.sponsorshipInferenceAuthorized, false);
  assert.equal(result.decisionAuthorityInferenceAuthorized, false);
  assert.equal(result.warmAccessInferenceAuthorized, false);
  assert.equal(result.privateContactDiscoveryAuthorized, false);
  assert.equal(result.outreachAuthorized, false);
  assert.equal(result.crmMutationAuthorized, false);
  assert.equal(result.externalActionAuthorized, false);
});

test("derives planning timing only from an evidenced activation window plus evidenced lead time", () => {
  const result = compileEvidenceBackedPlanningRadarV1(
    input({ evidence: [activationWindow(), engagementLead()] })
  );

  assert.equal(result.status, "READY");
  assert.equal(result.decision?.derivation, "DERIVED_FROM_ACTIVATION_AND_EVIDENCED_LEAD_TIME");
  assert.deepEqual(result.decision?.idealOutreachDateRange, {
    startDate: "2026-12-05T00:00:00.000Z",
    endDate: "2027-03-05T00:00:00.000Z"
  });
  assert.equal(result.decision?.disposition, "PLAN_AHEAD");
});

test("allows a public primary source to establish activation timing but not a planning window or engagement lead time", () => {
  const publicPlanning = compileEvidenceBackedPlanningRadarV1(
    input({ evidence: [planningWindow({ sourceClass: "PUBLIC_PRIMARY_SOURCE" })] })
  );
  assert.equal(publicPlanning.status, "BLOCKED");
  assert.ok(publicPlanning.issues.includes("EVIDENCE_SOURCE_NOT_ALLOWED"));
  assert.equal(publicPlanning.decision, null);

  const publicLead = compileEvidenceBackedPlanningRadarV1(
    input({ evidence: [activationWindow(), engagementLead({ sourceClass: "PUBLIC_PRIMARY_SOURCE" })] })
  );
  assert.equal(publicLead.status, "BLOCKED");
  assert.ok(publicLead.issues.includes("EVIDENCE_SOURCE_NOT_ALLOWED"));
});

test("fails closed when evidence is linked to a different organization or opportunity", () => {
  const wrongOrg = compileEvidenceBackedPlanningRadarV1(
    input({ evidence: [planningWindow({ canonicalOrganizationRef: "org:other" })] })
  );
  assert.equal(wrongOrg.status, "BLOCKED");
  assert.ok(wrongOrg.issues.includes("EVIDENCE_LINKAGE_MISMATCH"));

  const wrongOpportunity = compileEvidenceBackedPlanningRadarV1(
    input({ evidence: [planningWindow({ canonicalOpportunityRef: "opportunity:other" })] })
  );
  assert.equal(wrongOpportunity.status, "BLOCKED");
  assert.ok(wrongOpportunity.issues.includes("EVIDENCE_LINKAGE_MISMATCH"));
});

test("fails closed on future observations instead of using them to create urgency", () => {
  const result = compileEvidenceBackedPlanningRadarV1(
    input({ evidence: [planningWindow({ observedAt: "2026-09-19T00:00:00.000Z" })] })
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("EVIDENCE_OBSERVED_IN_FUTURE"));
  assert.equal(result.decision, null);
});

test("preserves freshness truth by routing old evidence to verification under an explicit caller-owned maximum age", () => {
  const result = compileEvidenceBackedPlanningRadarV1(
    input({
      evidence: [planningWindow({ observedAt: "2026-06-01T00:00:00.000Z" })],
      maximumEvidenceAgeDays: 30
    })
  );

  assert.equal(result.status, "READY");
  assert.equal(result.decision?.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.decision?.coverageGaps.includes("TIMING_EVIDENCE_STALE"));
});

test("requires the caller to own the evidence freshness policy rather than using a hidden default", () => {
  assert.throws(
    () =>
      compileEvidenceBackedPlanningRadarV1({
        ...input(),
        maximumEvidenceAgeDays: undefined as unknown as number
      }),
    /maximumEvidenceAgeDays must be an explicit integer/
  );
});

test("blocks duplicate evidence ids and conflicting records for the same timing dimension", () => {
  const duplicateId = compileEvidenceBackedPlanningRadarV1(
    input({
      evidence: [
        planningWindow(),
        activationWindow({ evidenceId: "planning:official-window" })
      ]
    })
  );
  assert.equal(duplicateId.status, "BLOCKED");
  assert.ok(duplicateId.issues.includes("EVIDENCE_ID_DUPLICATED"));

  const conflict = compileEvidenceBackedPlanningRadarV1(
    input({
      evidence: [
        planningWindow(),
        planningWindow({
          evidenceId: "planning:other-window",
          evidenceRefs: ["source:other-official-deck"],
          startDate: "2027-03-01T00:00:00.000Z",
          endDate: "2027-04-30T23:59:59.000Z"
        })
      ]
    })
  );
  assert.equal(conflict.status, "BLOCKED");
  assert.ok(conflict.issues.includes("CONFLICTING_PLANNING_WINDOW_EVIDENCE"));
});

test("merges corroborating records only when their timing content and truth state agree exactly", () => {
  const result = compileEvidenceBackedPlanningRadarV1(
    input({
      evidence: [
        planningWindow(),
        planningWindow({
          evidenceId: "planning:authorized-copy",
          sourceClass: "AUTHORIZED_FIRST_PARTY",
          evidenceRefs: ["source:first-party-copy"],
          observedAt: "2026-09-18T20:30:00.000Z"
        })
      ]
    })
  );

  assert.equal(result.status, "READY");
  assert.equal(result.decision?.disposition, "PLAN_AHEAD");
  assert.deepEqual(result.evidenceRecordIds, ["planning:authorized-copy", "planning:official-window"]);
  assert.ok(result.evidenceRefs.includes("source:first-party-copy"));
  assert.ok(result.evidenceRefs.includes("source:official-sponsorship-deck"));
});

test("blocks direct planning timing when an independent evidenced derivation does not overlap it", () => {
  const result = compileEvidenceBackedPlanningRadarV1(
    input({
      evidence: [
        planningWindow({
          startDate: "2026-10-01T00:00:00.000Z",
          endDate: "2026-10-31T23:59:59.000Z"
        }),
        activationWindow(),
        engagementLead()
      ]
    })
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("DIRECT_AND_DERIVED_PLANNING_WINDOWS_CONFLICT"));
  assert.equal(result.decision, null);
});

test("does not manufacture a planning decision without canonical timing evidence", () => {
  const result = compileEvidenceBackedPlanningRadarV1(input({ evidence: [] }));

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("NO_TIMING_EVIDENCE"));
  assert.equal(result.decision, null);
});

test("is deterministic, deeply immutable, and preserves source lineage", () => {
  const value = input({ evidence: [activationWindow(), engagementLead()] });
  const first = compileEvidenceBackedPlanningRadarV1(value);
  const second = compileEvidenceBackedPlanningRadarV1(value);

  assert.deepEqual(first, second);
  assert.ok(first.evidenceRefs.includes("activation:official-season"));
  assert.ok(first.evidenceRefs.includes("lead:official-buying-cycle"));
  assert.ok(first.evidenceRefs.includes("source:official-2027-schedule"));
  assert.ok(first.evidenceRefs.includes("source:first-party-planning-note"));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.evidenceRefs), true);
  assert.equal(Object.isFrozen(first.decision), true);
});
