import assert from "node:assert/strict";
import test from "node:test";

import {
  handoffSponsorDecisionMakerResearchEvidenceV1,
  type SponsorDecisionMakerResearchObservationV1
} from "@/lib/relationship-intelligence/sponsor-decision-maker-research-evidence-handoff-v1";
import type {
  SponsorDecisionMakerResearchPlanResultV1,
  SponsorDecisionMakerResearchTaskV1
} from "@/lib/relationship-intelligence/sponsor-decision-maker-research-plan-v1";

function task(overrides: Partial<SponsorDecisionMakerResearchTaskV1> = {}): SponsorDecisionMakerResearchTaskV1 {
  return {
    taskId: "sponsor-decision-maker-research:portfolio:acme:RESEARCH_CURRENT_DECISION_MAKER",
    upstreamOrdinal: 0,
    portfolioEntryId: "portfolio:acme",
    sponsorCandidateId: "sponsor:acme",
    qualificationCandidateId: "qualification:acme",
    canonicalOpportunityRef: "opportunity:acme-2027",
    canonicalOrganizationRef: "org:acme",
    canonicalPersonRef: "person:buyer",
    workType: "RESEARCH_CURRENT_DECISION_MAKER",
    evidenceNeed: "CURRENT_DECISION_MAKER_EVIDENCE",
    allowedSourceClasses: [
      "OFFICIAL_ORGANIZATION_SOURCE",
      "PUBLIC_PRIMARY_SOURCE",
      "AUTHORIZED_FIRST_PARTY"
    ],
    evidenceRefs: ["evidence:gap:1"],
    reasonCodes: ["DECISION_MAKER_AUTHORITY_EVIDENCE_NOT_ESTABLISHED"],
    factCreationAuthorized: false,
    privateContactDiscoveryAuthorized: false,
    relationshipInferenceAuthorized: false,
    sponsorshipInferenceAuthorized: false,
    decisionAuthorityInferenceAuthorized: false,
    opportunityQualificationAuthorized: false,
    crmMutationAuthorized: false,
    relationshipMutationAuthorized: false,
    outreachAuthorized: false,
    ...overrides
  };
}

function plan(tasks: readonly SponsorDecisionMakerResearchTaskV1[] = [task()]): SponsorDecisionMakerResearchPlanResultV1 {
  return {
    version: "SPONSOR_DECISION_MAKER_RESEARCH_PLAN_V1",
    generatedAt: "2026-09-19T16:00:00.000Z",
    status: "READY",
    issues: [],
    tasks,
    omittedTaskCount: 0,
    orderingPolicy: "PRESERVE_UPSTREAM_SAFETY_AND_WORKFLOW_ORDER",
    returnPolicy: "OBSERVED_EVIDENCE_MUST_REENTER_CANONICAL_REVIEW",
    limitations: ["Observed evidence must return through canonical review."],
    authority: {
      analysisOnly: true,
      internalResearchPreparationAllowed: true,
      externalResearchExecutionAuthorized: false,
      factCreationAuthorized: false,
      privateContactDiscoveryAuthorized: false,
      relationshipInferenceAuthorized: false,
      sponsorshipInferenceAuthorized: false,
      decisionAuthorityInferenceAuthorized: false,
      opportunityQualificationAuthorized: false,
      crmMutationAuthorized: false,
      relationshipMutationAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      contractAuthorized: false,
      externalActionAuthorized: false
    }
  };
}

function observation(overrides: Partial<SponsorDecisionMakerResearchObservationV1> = {}): SponsorDecisionMakerResearchObservationV1 {
  return {
    observationId: "observation:acme:buyer-role:1",
    taskId: "sponsor-decision-maker-research:portfolio:acme:RESEARCH_CURRENT_DECISION_MAKER",
    portfolioEntryId: "portfolio:acme",
    sponsorCandidateId: "sponsor:acme",
    qualificationCandidateId: "qualification:acme",
    canonicalOpportunityRef: "opportunity:acme-2027",
    canonicalOrganizationRef: "org:acme",
    canonicalPersonRef: "person:buyer",
    workType: "RESEARCH_CURRENT_DECISION_MAKER",
    evidenceNeed: "CURRENT_DECISION_MAKER_EVIDENCE",
    sourceClass: "OFFICIAL_ORGANIZATION_SOURCE",
    observedAt: "2026-09-19T16:10:00.000Z",
    truthState: "KNOWN",
    claimRef: "claim:official-role:1",
    evidenceRefs: ["evidence:official-role:1"],
    ...overrides
  };
}

const baseInput = {
  evaluatedAt: "2026-09-19T16:20:00.000Z",
  maximumPlanAgeMinutes: 60,
  maximumObservationAgeMinutes: 60
} as const;

test("returns exact current sponsor decision-maker evidence only to canonical review", () => {
  const result = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [observation()],
    ...baseInput
  });

  assert.equal(result.status, "READY");
  assert.equal(result.counts.readyForCanonicalReview, 1);
  assert.equal(result.candidates[0].disposition, "READY_FOR_CANONICAL_REVIEW");
  assert.equal(result.candidates[0].canonicalOrganizationRef, "org:acme");
  assert.equal(result.candidates[0].canonicalPersonRef, "person:buyer");
  assert.equal(result.candidates[0].decisionMakerFactPromotionAuthorized, false);
  assert.equal(result.candidates[0].decisionAuthorityInferenceAuthorized, false);
  assert.equal(result.candidates[0].contactCoordinateExposureAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.returnPolicy, "CANONICAL_REVIEW_REQUIRED_BEFORE_FACT_OR_STATE_CHANGE");
});

test("keeps partial and unknown observations out of the ready lane", () => {
  const partial = observation({
    observationId: "observation:partial",
    claimRef: "claim:partial",
    evidenceRefs: ["evidence:partial"],
    truthState: "PARTIAL"
  });
  const unknown = observation({
    observationId: "observation:unknown",
    claimRef: "claim:unknown",
    evidenceRefs: ["evidence:unknown"],
    truthState: "UNKNOWN"
  });

  const result = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [partial, unknown],
    ...baseInput
  });

  assert.equal(result.status, "READY");
  assert.equal(result.counts.readyForCanonicalReview, 0);
  assert.equal(result.counts.verificationRequired, 1);
  assert.equal(result.counts.researchRequired, 1);
  assert.equal(result.candidates[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.candidates[1].disposition, "RESEARCH_REQUIRED");
});

test("requires exact task and canonical identity instead of accepting nearby sponsor evidence", () => {
  const result = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [observation({ canonicalPersonRef: "person:other" })],
    ...baseInput
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.candidates, []);
  assert.ok(result.issues.some((issue) => issue.includes("does not exactly match its source sponsor research task")));
});

test("rejects a source class that was not allowed by the exact research task", () => {
  const result = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [observation({ sourceClass: "CANONICAL_RELATIONSHIP_GRAPH" })],
    ...baseInput
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some((issue) => issue.includes("sourceClass is not allowed")));
});

test("treats age-based staleness as verification rather than current buyer truth", () => {
  const result = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [observation({ observedAt: "2026-09-19T14:00:00.000Z" })],
    ...baseInput
  });

  assert.equal(result.status, "READY");
  assert.equal(result.candidates[0].disposition, "VERIFY_REQUIRED");
  assert.deepEqual(result.candidates[0].reasonCodes, ["OBSERVATION_STALE"]);
});

test("fails closed on stale plans and widened upstream authority", () => {
  const stale = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [observation()],
    evaluatedAt: "2026-09-20T16:20:00.000Z",
    maximumPlanAgeMinutes: 60,
    maximumObservationAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("SOURCE_PLAN_STALE"));

  const source = plan();
  const widened = {
    ...source,
    authority: { ...source.authority, outreachAuthorized: true }
  } as unknown as SponsorDecisionMakerResearchPlanResultV1;
  const widenedResult = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: widened,
    observations: [observation()],
    ...baseInput
  });
  assert.equal(widenedResult.status, "BLOCKED");
  assert.ok(widenedResult.issues.includes("SOURCE_PLAN_AUTHORITY_WIDENED"));
});

test("blocks duplicate task claims so repeated records cannot masquerade as additional support", () => {
  const result = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [
      observation(),
      observation({ observationId: "observation:acme:buyer-role:2" })
    ],
    ...baseInput
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some((issue) => issue.startsWith("DUPLICATE_TASK_CLAIM:")));
});

test("rejects raw private contact coordinates and unsupported observation fields", () => {
  assert.throws(() => handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [observation({ claimRef: "mailto:private@example.com" })],
    ...baseInput
  }), /claimRef is unsafe/);

  const withRawBody = {
    ...observation(),
    rawMessageBody: "private body"
  } as unknown as SponsorDecisionMakerResearchObservationV1;
  assert.throws(() => handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [withRawBody],
    ...baseInput
  }), /contains unsupported field rawMessageBody/);
});

test("returns no-observation posture without manufacturing a decision maker", () => {
  const result = handoffSponsorDecisionMakerResearchEvidenceV1({
    plan: plan(),
    observations: [],
    ...baseInput
  });

  assert.equal(result.status, "NO_OBSERVATIONS");
  assert.deepEqual(result.candidates, []);
  assert.equal(result.counts.observationsReviewed, 0);
});
