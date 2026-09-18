import assert from "node:assert/strict";
import test from "node:test";

import {
  assessOpportunityQualificationReadinessV1
} from "@/lib/relationship-intelligence/opportunity-qualification-readiness-v1";
import {
  normalizeOpportunitySignalsV1,
  type OpportunitySignalIntakeResultV1,
  type OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

const INTAKE_AT = "2026-09-18T17:30:00.000Z";
const REVIEW_AT = "2026-09-18T17:35:00.000Z";

function observation(overrides: Partial<OpportunitySourceObservationV1> = {}): OpportunitySourceObservationV1 {
  return {
    captureId: "capture:boardroom:qualification:1",
    sourceKind: "BOARDROOM",
    sourceEventKey: "boardroom:event:qualification:1",
    sourceRef: "boardroom:article:qualification:1",
    observedAt: "2026-09-18T16:00:00.000Z",
    evidenceRefs: ["ev:boardroom:qualification:1"],
    truthState: "KNOWN",
    signalType: "SPONSORSHIP_OPPORTUNITY",
    organizationRef: "org:brand-a",
    opportunityRef: "opportunity:sponsor-a",
    ...overrides
  };
}

function intake(observations: readonly OpportunitySourceObservationV1[]): OpportunitySignalIntakeResultV1 {
  return normalizeOpportunitySignalsV1({ evaluatedAt: INTAKE_AT, observations });
}

test("moves an exact evidence-backed sponsorship signal only to internal qualification review readiness", () => {
  const result = assessOpportunityQualificationReadinessV1({
    evaluatedAt: REVIEW_AT,
    intake: intake([observation()])
  });

  assert.equal(result.status, "READY");
  assert.equal(result.decisions.length, 1);
  const decision = result.decisions[0];
  assert.equal(decision.disposition, "READY_FOR_INTERNAL_QUALIFICATION_REVIEW");
  assert.equal(decision.canonicalOpportunityRef, "opportunity:sponsor-a");
  assert.equal(decision.canonicalOrganizationRef, "org:brand-a");
  assert.equal(decision.qualificationOutcome, "NOT_ESTABLISHED");
  assert.equal(decision.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(decision.budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(decision.opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(decision.dealLikelihood, "NOT_ESTABLISHED");
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("requires an exact canonical opportunity before a captured signal can reach qualification review", () => {
  const result = assessOpportunityQualificationReadinessV1({
    evaluatedAt: REVIEW_AT,
    intake: intake([observation({ opportunityRef: null })])
  });

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "RESEARCH_REQUIRED");
  assert.ok(decision.evidenceGaps.includes("EXACT_CANONICAL_OPPORTUNITY_REQUIRED"));
  assert.ok(decision.reasonCodes.includes("CAPTURED_SIGNAL_LACKS_EXACT_CANONICAL_OPPORTUNITY"));
});

test("requires a canonical organization for sponsorship rather than treating a person-only anchor as a sponsor", () => {
  const result = assessOpportunityQualificationReadinessV1({
    evaluatedAt: REVIEW_AT,
    intake: intake([observation({ organizationRef: null, personRef: "person:buyer-a" })])
  });

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "RESEARCH_REQUIRED");
  assert.ok(decision.evidenceGaps.includes("CANONICAL_SPONSOR_ORGANIZATION_REQUIRED"));
  assert.equal(decision.sponsorInterest, "NOT_ESTABLISHED");
});

test("keeps planning, decision-maker, and warm-intro observations as context instead of standalone opportunities", () => {
  for (const signalType of ["PLANNING_WINDOW", "DECISION_MAKER_CHANGE", "WARM_INTRO"] as const) {
    const result = assessOpportunityQualificationReadinessV1({
      evaluatedAt: REVIEW_AT,
      intake: intake([observation({ signalType })])
    });
    assert.equal(result.decisions[0].disposition, "CONTEXT_ONLY");
    assert.equal(result.decisions[0].nextInternalAction, "ATTACH_CONTEXT_TO_EXACT_EXISTING_OPPORTUNITY_ONLY");
    assert.equal(result.decisions[0].qualificationOutcome, "NOT_ESTABLISHED");
  }
});

test("requires research before context can attach when no exact canonical opportunity exists", () => {
  const result = assessOpportunityQualificationReadinessV1({
    evaluatedAt: REVIEW_AT,
    intake: intake([observation({ signalType: "WARM_INTRO", opportunityRef: null })])
  });

  assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(result.decisions[0].evidenceGaps.includes("EXACT_CANONICAL_OPPORTUNITY_REQUIRED_FOR_CONTEXT_ATTACHMENT"));
});

test("propagates upstream verification, research, and suppression instead of laundering weak signals", () => {
  const verify = intake([observation({
    evidenceRefs: ["ev:boardroom:qualification:1"],
    personRef: "person:buyer-a",
    warmAccessClaim: { state: "SUPPORTED", evidenceRefs: ["ev:not-in-lineage"] }
  })]);
  const research = intake([observation({ truthState: "PARTIAL" })]);
  const suppress = intake([observation({ signalType: "NONE" })]);

  assert.equal(assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: verify }).decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: research }).decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: suppress }).decisions[0].disposition, "SUPPRESS");
});

test("preserves separately evidenced context without turning it into interest, confidence, or qualification", () => {
  const source = observation({
    personRef: "person:buyer-a",
    evidenceRefs: ["ev:boardroom:qualification:1", "ev:planning", "ev:authority", "ev:sponsor-link", "ev:warm"],
    planningWindow: {
      startAt: "2026-10-01T00:00:00.000Z",
      endAt: "2026-11-01T00:00:00.000Z",
      rationale: "Explicit planning dates supplied by the structured upstream source.",
      evidenceRefs: ["ev:planning"]
    },
    decisionMakerClaim: { authorityClass: "DECISION_MAKER", evidenceRefs: ["ev:authority"] },
    sponsorshipRelationshipClaim: { state: "SUPPORTED", evidenceRefs: ["ev:sponsor-link"] },
    warmAccessClaim: { state: "SUPPORTED", evidenceRefs: ["ev:warm"] }
  });

  const result = assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: intake([source]) });
  const decision = result.decisions[0];
  assert.equal(decision.disposition, "READY_FOR_INTERNAL_QUALIFICATION_REVIEW");
  assert.deepEqual(decision.supportedContext, [
    "DECISION_MAKER_AUTHORITY",
    "PLANNING_WINDOW",
    "SPONSORSHIP_RELATIONSHIP",
    "WARM_ACCESS"
  ]);
  assert.equal(decision.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(decision.confidenceFromSourceCount, "NOT_ESTABLISHED");
  assert.equal(decision.qualificationOutcome, "NOT_ESTABLISHED");
});

test("multiple exact-opportunity sources remain evidence, not a confidence uplift", () => {
  const boardroom = observation();
  const email = observation({
    captureId: "capture:email:qualification:1",
    sourceKind: "EMAIL",
    sourceEventKey: "email:event:qualification:1",
    sourceRef: "mailbox:keegan:message:qualification:1",
    evidenceRefs: ["ev:email:qualification:1"]
  });

  const result = assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: intake([boardroom, email]) });
  const decision = result.decisions[0];
  assert.equal(decision.disposition, "READY_FOR_INTERNAL_QUALIFICATION_REVIEW");
  assert.deepEqual(decision.sourceKinds, ["BOARDROOM", "EMAIL"]);
  assert.equal(decision.confidenceFromSourceCount, "NOT_ESTABLISHED");
  assert.ok(decision.reasonCodes.includes("MULTIPLE_SOURCES_PRESERVED_WITHOUT_CONFIDENCE_UPLIFT"));
});

test("fails a tampered downstream claim outside intake evidence lineage to verification", () => {
  const clean = intake([observation({ personRef: "person:buyer-a" })]);
  const original = clean.decisions[0];
  const tampered: OpportunitySignalIntakeResultV1 = {
    ...clean,
    decisions: [{
      ...original,
      warmAccess: { state: "SUPPORTED", evidenceRefs: ["ev:invented-warm-path"] }
    }]
  };

  const result = assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: tampered });
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("INTEGRITY:WARM_ACCESS_EVIDENCE_OUTSIDE_INTAKE_LINEAGE"));
  assert.equal(result.authority.outreachAuthorized, false);
});

test("blocks stale or future intake projections instead of reusing them as current truth", () => {
  const clean = intake([observation()]);
  const stale = assessOpportunityQualificationReadinessV1({
    evaluatedAt: "2026-09-18T20:00:00.000Z",
    maximumProjectionAgeMinutes: 60,
    intake: clean
  });
  assert.equal(stale.status, "BLOCKED");
  assert.deepEqual(stale.issues, ["INTAKE_PROJECTION_STALE"]);
  assert.deepEqual(stale.decisions, []);

  const future: OpportunitySignalIntakeResultV1 = {
    ...clean,
    generatedAt: "2026-09-18T18:00:00.000Z"
  };
  const futureResult = assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: future });
  assert.equal(futureResult.status, "BLOCKED");
  assert.deepEqual(futureResult.issues, ["INTAKE_GENERATED_IN_FUTURE"]);
});

test("rejects duplicate candidate identities instead of double-counting an opportunity", () => {
  const clean = intake([observation()]);
  const duplicated: OpportunitySignalIntakeResultV1 = {
    ...clean,
    decisions: [clean.decisions[0], clean.decisions[0]]
  };

  assert.throws(() => assessOpportunityQualificationReadinessV1({ evaluatedAt: REVIEW_AT, intake: duplicated }), /duplicate candidateId/);
});
