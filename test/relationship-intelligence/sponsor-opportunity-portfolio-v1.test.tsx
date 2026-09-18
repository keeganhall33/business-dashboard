import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSponsorOpportunityPortfolioV1,
  type SponsorOpportunityPortfolioBindingV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-portfolio-v1";
import type {
  SponsorOpportunityEarlyWarningAlertV1,
  SponsorOpportunityEarlyWarningResultV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-early-warning-v1";
import type {
  OpportunityQualificationReadinessDecisionV1,
  OpportunityQualificationReadinessResultV1
} from "@/lib/relationship-intelligence/opportunity-qualification-readiness-v1";

const GENERATED_AT = "2026-09-18T22:00:00.000Z";
const EVALUATED_AT = "2026-09-18T22:20:00.000Z";

function alert(
  overrides: Partial<SponsorOpportunityEarlyWarningAlertV1> = {}
): SponsorOpportunityEarlyWarningAlertV1 {
  return {
    alertId: "sponsor-radar:brand-a",
    candidateId: "sponsor:brand-a:school-a",
    canonicalOrganizationRef: "org:brand-a",
    canonicalPersonRef: "person:buyer-a",
    readinessStatus: "READY_TO_PREPARE",
    attentionClass: "PREPARE_NOW",
    nextInternalAction: "PREPARE_APPROVAL_READY_OUTREACH",
    idealOutreachDateRange: {
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-10-15T00:00:00.000Z"
    },
    timingRationale: "Existing evidence-backed planning window is open.",
    evidenceRefs: ["ev:radar:access", "ev:radar:timing"],
    gaps: [],
    reasonCodes: ["CURRENT_ROLE_AND_ACCESS_SUPPORTED"],
    contextSignals: [],
    opportunityImpactFromContextSignals: "NOT_ESTABLISHED",
    sponsorInterest: "NOT_ESTABLISHED",
    budgetAvailability: "NOT_ESTABLISHED",
    dealLikelihood: "NOT_ESTABLISHED",
    ...overrides
  };
}

function radar(
  alerts: readonly SponsorOpportunityEarlyWarningAlertV1[] = [alert()],
  overrides: Partial<SponsorOpportunityEarlyWarningResultV1> = {}
): SponsorOpportunityEarlyWarningResultV1 {
  return {
    version: "SPONSOR_OPPORTUNITY_EARLY_WARNING_V1",
    generatedAt: GENERATED_AT,
    status: "READY",
    issues: [],
    alerts,
    counts: {
      VERIFY_BEFORE_ACTION: alerts.filter((item) => item.attentionClass === "VERIFY_BEFORE_ACTION").length,
      PREPARE_NOW: alerts.filter((item) => item.attentionClass === "PREPARE_NOW").length,
      PLAN_AHEAD: alerts.filter((item) => item.attentionClass === "PLAN_AHEAD").length,
      RESOLVE_ACCESS: alerts.filter((item) => item.attentionClass === "RESOLVE_ACCESS").length,
      RECOVER_NEXT_CYCLE: alerts.filter((item) => item.attentionClass === "RECOVER_NEXT_CYCLE").length,
      RESEARCH_GAPS: alerts.filter((item) => item.attentionClass === "RESEARCH_GAPS").length
    },
    limitations: [],
    matchingPolicy: "EXACT_CANONICAL_SPONSOR_OR_PERSON_ANCHOR_ONLY",
    authority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      contractAuthorized: false,
      externalActionAuthorized: false
    },
    ...overrides
  };
}

function qualificationDecision(
  overrides: Partial<OpportunityQualificationReadinessDecisionV1> = {}
): OpportunityQualificationReadinessDecisionV1 {
  return {
    candidateId: "opportunity-candidate:brand-a:school-a",
    disposition: "READY_FOR_INTERNAL_QUALIFICATION_REVIEW",
    signalType: "SPONSORSHIP_OPPORTUNITY",
    canonicalOrganizationRef: "org:brand-a",
    canonicalPersonRef: "person:buyer-a",
    canonicalOpportunityRef: "opportunity:brand-a:school-a",
    observedAt: "2026-09-18T21:30:00.000Z",
    sourceKinds: ["BOARDROOM"],
    sourceRefs: ["boardroom:story:brand-a"],
    evidenceRefs: ["ev:qualification:brand-a"],
    supportedContext: ["PLANNING_WINDOW", "DECISION_MAKER_AUTHORITY"],
    sponsorInterest: "NOT_ESTABLISHED",
    budgetAvailability: "NOT_ESTABLISHED",
    opportunityCertainty: "NOT_ESTABLISHED",
    dealLikelihood: "NOT_ESTABLISHED",
    confidenceFromSourceCount: "NOT_ESTABLISHED",
    qualificationOutcome: "NOT_ESTABLISHED",
    nextInternalAction: "REVIEW_EVIDENCE_PACKET",
    evidenceGaps: [],
    reasonCodes: ["EXACT_CANONICAL_OPPORTUNITY_SUPPORTED"],
    ...overrides
  };
}

function qualification(
  decisions: readonly OpportunityQualificationReadinessDecisionV1[] = [qualificationDecision()],
  overrides: Partial<OpportunityQualificationReadinessResultV1> = {}
): OpportunityQualificationReadinessResultV1 {
  return {
    version: "OPPORTUNITY_QUALIFICATION_READINESS_V1",
    generatedAt: GENERATED_AT,
    status: "READY",
    issues: [],
    decisions,
    counts: {
      READY_FOR_INTERNAL_QUALIFICATION_REVIEW: decisions.filter((item) => item.disposition === "READY_FOR_INTERNAL_QUALIFICATION_REVIEW").length,
      CONTEXT_ONLY: decisions.filter((item) => item.disposition === "CONTEXT_ONLY").length,
      RESEARCH_REQUIRED: decisions.filter((item) => item.disposition === "RESEARCH_REQUIRED").length,
      VERIFY_REQUIRED: decisions.filter((item) => item.disposition === "VERIFY_REQUIRED").length,
      SUPPRESS: decisions.filter((item) => item.disposition === "SUPPRESS").length
    },
    limitations: [],
    authority: {
      analysisOnly: true,
      internalQualificationReviewAllowed: true,
      qualificationMutationAuthorized: false,
      crmMutationAuthorized: false,
      relationshipMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      contractAuthorized: false,
      externalActionAuthorized: false
    },
    ...overrides
  };
}

function binding(
  overrides: Partial<SponsorOpportunityPortfolioBindingV1> = {}
): SponsorOpportunityPortfolioBindingV1 {
  return {
    bindingId: "binding:sponsor-a:opportunity-a",
    sponsorCandidateId: "sponsor:brand-a:school-a",
    qualificationCandidateId: "opportunity-candidate:brand-a:school-a",
    canonicalOpportunityRef: "opportunity:brand-a:school-a",
    observedAt: "2026-09-18T22:05:00.000Z",
    truthState: "KNOWN",
    basis: "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING",
    evidenceRefs: ["ev:binding:brand-a"],
    ...overrides
  };
}

function build(overrides: Partial<Parameters<typeof buildSponsorOpportunityPortfolioV1>[0]> = {}) {
  return buildSponsorOpportunityPortfolioV1({
    evaluatedAt: EVALUATED_AT,
    radar: radar(),
    qualification: qualification(),
    bindings: [binding()],
    maximumProjectionAgeMinutes: 60,
    maximumBindingAgeMinutes: 60,
    ...overrides
  });
}

test("joins sponsor readiness to qualification only through an explicit exact canonical opportunity binding", () => {
  const result = build();

  assert.equal(result.status, "READY");
  assert.equal(result.entries.length, 1);
  const entry = result.entries[0];
  assert.equal(entry.state, "REVIEW_NOW");
  assert.equal(entry.canonicalOpportunityRef, "opportunity:brand-a:school-a");
  assert.equal(entry.canonicalOrganizationRef, "org:brand-a");
  assert.equal(entry.linkedCanonicalPersonRef, "person:buyer-a");
  assert.equal(entry.nextInternalAction, "REVIEW_PREPARATION_AND_QUALIFICATION_PACKET");
  assert.ok(entry.evidenceRefs.includes("ev:radar:access"));
  assert.ok(entry.evidenceRefs.includes("ev:qualification:brand-a"));
  assert.ok(entry.evidenceRefs.includes("ev:binding:brand-a"));
  assert.equal(entry.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(entry.budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(entry.opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(entry.dealLikelihood, "NOT_ESTABLISHED");
  assert.equal(entry.confidence, "NOT_ESTABLISHED");
  assert.equal(entry.monetaryValue, null);
  assert.equal(entry.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.matchingPolicy, "EXPLICIT_BINDING_PLUS_EXACT_CANONICAL_IDENTITY_ONLY");
  assert.equal(result.orderingPolicy, "SAFETY_AND_WORKFLOW_ONLY_NOT_BUSINESS_VALUE");
});

test("keeps an unbound sponsor alert visible as a research gap instead of guessing an opportunity", () => {
  const result = build({ bindings: [] });

  assert.equal(result.status, "READY");
  assert.equal(result.entries[0].state, "RESEARCH_REQUIRED");
  assert.equal(result.entries[0].qualificationCandidateId, null);
  assert.equal(result.entries[0].canonicalOpportunityRef, null);
  assert.ok(result.entries[0].gaps.includes("EXACT_CANONICAL_OPPORTUNITY_BINDING_REQUIRED"));
  assert.ok(result.entries[0].reasonCodes.includes("SPONSOR_ALERT_NOT_EXPLICITLY_BOUND_TO_CANONICAL_OPPORTUNITY"));
});

test("organization identity disagreement forces verification instead of joining plausible-looking records", () => {
  const result = build({
    qualification: qualification([qualificationDecision({ canonicalOrganizationRef: "org:brand-a-emea" })])
  });

  assert.equal(result.status, "READY");
  assert.equal(result.entries[0].state, "VERIFY_REQUIRED");
  assert.equal(result.entries[0].canonicalOrganizationRef, null);
  assert.ok(result.entries[0].gaps.includes("CANONICAL_ORGANIZATION_CONFLICT"));
  assert.ok(result.entries[0].reasonCodes.includes("SPONSOR_AND_QUALIFICATION_ORGANIZATION_REFS_DISAGREE"));
  assert.equal(result.entries[0].nextInternalAction, "VERIFY_EXACT_BINDING_OR_SOURCE_EVIDENCE");
});

test("person disagreement never becomes a warm-access or decision-maker identity assumption", () => {
  const result = build({
    qualification: qualification([qualificationDecision({ canonicalPersonRef: "person:different-buyer" })])
  });

  assert.equal(result.entries[0].state, "VERIFY_REQUIRED");
  assert.equal(result.entries[0].linkedCanonicalPersonRef, null);
  assert.equal(result.entries[0].sponsorCanonicalPersonRef, "person:buyer-a");
  assert.equal(result.entries[0].qualificationCanonicalPersonRef, "person:different-buyer");
  assert.ok(result.entries[0].gaps.includes("CANONICAL_PERSON_CONFLICT"));
});

test("qualification verification, research, context, and suppression cannot be upgraded by sponsor readiness", () => {
  const cases = [
    ["VERIFY_REQUIRED", "VERIFY_REQUIRED"],
    ["RESEARCH_REQUIRED", "RESEARCH_REQUIRED"],
    ["CONTEXT_ONLY", "CONTEXT_ONLY"],
    ["SUPPRESS", "SUPPRESS"]
  ] as const;

  for (const [disposition, expectedState] of cases) {
    const result = build({
      qualification: qualification([qualificationDecision({ disposition })])
    });
    assert.equal(result.entries[0].state, expectedState, disposition);
  }
});

test("when qualification is review-ready, portfolio preserves sponsor workflow state rather than inventing value ranking", () => {
  const cases = [
    ["PREPARE_NOW", "REVIEW_NOW"],
    ["PLAN_AHEAD", "PLAN_AHEAD"],
    ["RESOLVE_ACCESS", "ACCESS_BLOCKED"],
    ["RECOVER_NEXT_CYCLE", "RECOVER_NEXT_CYCLE"],
    ["RESEARCH_GAPS", "RESEARCH_REQUIRED"],
    ["VERIFY_BEFORE_ACTION", "VERIFY_REQUIRED"]
  ] as const;

  for (const [attentionClass, expectedState] of cases) {
    const result = build({ radar: radar([alert({ attentionClass })]) });
    assert.equal(result.entries[0].state, expectedState, attentionClass);
    assert.equal(result.entries[0].confidence, "NOT_ESTABLISHED");
    assert.equal(result.entries[0].monetaryValue, null);
  }
});

test("partial or conflicted explicit bindings fail the whole join closed", () => {
  for (const truthState of ["PARTIAL", "CONFLICTED"] as const) {
    const result = build({ bindings: [binding({ truthState })] });
    assert.equal(result.status, "BLOCKED");
    assert.ok(result.issues.includes(`BINDING_NOT_KNOWN:binding:sponsor-a:opportunity-a`));
    assert.deepEqual(result.entries, []);
  }
});

test("binding must target exact upstream candidate ids and exact canonical opportunity ref", () => {
  const missingSponsor = build({
    bindings: [binding({ sponsorCandidateId: "sponsor:unknown" })]
  });
  assert.equal(missingSponsor.status, "BLOCKED");
  assert.ok(missingSponsor.issues.includes("BINDING_SPONSOR_TARGET_MISSING:binding:sponsor-a:opportunity-a"));

  const missingQualification = build({
    bindings: [binding({ qualificationCandidateId: "opportunity-candidate:unknown" })]
  });
  assert.equal(missingQualification.status, "BLOCKED");
  assert.ok(missingQualification.issues.includes("BINDING_QUALIFICATION_TARGET_MISSING:binding:sponsor-a:opportunity-a"));

  const opportunityMismatch = build({
    bindings: [binding({ canonicalOpportunityRef: "opportunity:different" })]
  });
  assert.equal(opportunityMismatch.status, "BLOCKED");
  assert.ok(opportunityMismatch.issues.includes("BINDING_OPPORTUNITY_REF_MISMATCH:binding:sponsor-a:opportunity-a"));
});

test("duplicate and conflicting binding records fail closed rather than choosing a winner", () => {
  const duplicate = binding();
  const result = build({ bindings: [duplicate, duplicate] });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("DUPLICATE_BINDING_ID:binding:sponsor-a:opportunity-a"));
  assert.ok(result.issues.includes("CONFLICTING_SPONSOR_BINDING:sponsor:brand-a:school-a"));
});

test("caller-owned freshness blocks stale or future radar, qualification, and binding evidence", () => {
  const staleRadar = build({
    radar: radar([alert()], { generatedAt: "2026-09-18T19:00:00.000Z" })
  });
  assert.ok(staleRadar.issues.includes("RADAR_PROJECTION_STALE"));

  const futureQualification = build({
    qualification: qualification([qualificationDecision()], { generatedAt: "2026-09-18T23:00:00.000Z" })
  });
  assert.ok(futureQualification.issues.includes("QUALIFICATION_GENERATED_IN_FUTURE"));

  const staleBinding = build({
    bindings: [binding({ observedAt: "2026-09-18T19:00:00.000Z" })]
  });
  assert.ok(staleBinding.issues.includes("BINDING_STALE:binding:sponsor-a:opportunity-a"));

  const futureBinding = build({
    bindings: [binding({ observedAt: "2026-09-18T23:00:00.000Z" })]
  });
  assert.ok(futureBinding.issues.includes("BINDING_OBSERVED_IN_FUTURE:binding:sponsor-a:opportunity-a"));
});

test("upstream blocked state or widened authority cannot be laundered into a portfolio", () => {
  const blockedRadar = build({ radar: radar([alert()], { status: "BLOCKED" }) });
  assert.equal(blockedRadar.status, "BLOCKED");
  assert.ok(blockedRadar.issues.includes("RADAR_NOT_READY"));

  const widenedQualification = qualification();
  const tampered: OpportunityQualificationReadinessResultV1 = {
    ...widenedQualification,
    authority: {
      ...widenedQualification.authority,
      outreachAuthorized: true as false
    }
  };
  const widened = build({ qualification: tampered });
  assert.equal(widened.status, "BLOCKED");
  assert.ok(widened.issues.includes("QUALIFICATION_AUTHORITY_INVARIANT_FAILED"));
});

test("unsafe private or secret-like evidence fails closed and never appears in output", () => {
  const result = build({
    bindings: [binding({ evidenceRefs: ["op://vault/item/password"] })]
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("BINDING_EVIDENCE_UNSAFE_OR_MISSING:binding:sponsor-a:opportunity-a"));
  assert.equal(JSON.stringify(result).includes("op://"), false);
});

test("workflow ordering is deterministic, safety-first, immutable, and grants no consequential authority", () => {
  const verifyAlert = alert({
    alertId: "sponsor-radar:verify",
    candidateId: "sponsor:brand-b:school-b",
    canonicalOrganizationRef: "org:brand-b",
    canonicalPersonRef: null,
    attentionClass: "VERIFY_BEFORE_ACTION",
    evidenceRefs: ["ev:radar:verify"]
  });
  const verifyQualification = qualificationDecision({
    candidateId: "opportunity-candidate:brand-b:school-b",
    canonicalOrganizationRef: "org:brand-b",
    canonicalPersonRef: null,
    canonicalOpportunityRef: "opportunity:brand-b:school-b",
    evidenceRefs: ["ev:qualification:brand-b"]
  });
  const verifyBinding = binding({
    bindingId: "binding:sponsor-b:opportunity-b",
    sponsorCandidateId: "sponsor:brand-b:school-b",
    qualificationCandidateId: "opportunity-candidate:brand-b:school-b",
    canonicalOpportunityRef: "opportunity:brand-b:school-b",
    evidenceRefs: ["ev:binding:brand-b"]
  });

  const input = {
    evaluatedAt: EVALUATED_AT,
    radar: radar([alert(), verifyAlert]),
    qualification: qualification([qualificationDecision(), verifyQualification]),
    bindings: [binding(), verifyBinding],
    maximumProjectionAgeMinutes: 60,
    maximumBindingAgeMinutes: 60
  } as const;
  const before = structuredClone(input);
  const first = buildSponsorOpportunityPortfolioV1(input);
  const second = buildSponsorOpportunityPortfolioV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(first.entries[0].state, "VERIFY_REQUIRED");
  assert.equal(first.entries[1].state, "REVIEW_NOW");
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.entries), true);
  assert.equal(Object.isFrozen(first.entries[0]), true);
  assert.equal(first.authority.qualificationMutationAuthorized, false);
  assert.equal(first.authority.crmMutationAuthorized, false);
  assert.equal(first.authority.relationshipMutationAuthorized, false);
  assert.equal(first.authority.contactDiscoveryAuthorized, false);
  assert.equal(first.authority.outreachAuthorized, false);
  assert.equal(first.authority.spendAuthorized, false);
  assert.equal(first.authority.contractAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
  assert.equal(first.authority.approvalBypassAuthorized, false);
});
