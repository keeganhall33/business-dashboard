import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewCommercialLearningApplicationV1,
  type CommercialLearningApplicationInputV1,
  type CommercialLearningCurrentContextV1
} from "@/lib/intelligence/organizational-learning/commercial-learning-application-review-v1";
import type { RecurringDecisionLessonReviewV1 } from "@/lib/intelligence/organizational-learning/recurring-decision-lessons-v1";

const reviewedAt = "2026-09-18T18:30:00.000Z";
const sourceObservedAt = "2026-09-18T17:00:00.000Z";
const currentObservedAt = "2026-09-18T18:00:00.000Z";

function recurringReview(
  overrides: Partial<RecurringDecisionLessonReviewV1> = {}
): RecurringDecisionLessonReviewV1 {
  return {
    version: "RECURRING_DECISION_LESSONS_V1",
    state: "REVIEW_CANDIDATE",
    reason_code: "REPEATED_APPROVED_LESSON",
    domain: "PRICING",
    pattern_key: "deposit-before-production",
    lesson_title: "Verify terms before committing production time",
    lesson_content: "In the observed cases, explicit commercial terms were reviewed before production time was committed.",
    source_learning_ids: ["lesson:1", "lesson:2"],
    decision_refs: ["decision:past:1", "decision:past:2"],
    outcome_refs: ["outcome:1", "outcome:2"],
    evidence_refs: ["evidence:lesson:1", "evidence:lesson:2"],
    source_lineage_ids: ["lineage:1", "lineage:2"],
    duplicate_observation_ids: [],
    verification_reasons: [],
    causal_interpretation: "NOT_ESTABLISHED",
    review_required: true,
    policy_promotion_allowed: false,
    pricing_change_allowed: false,
    negotiation_action_allowed: false,
    external_action_allowed: false,
    persistence_authority: false,
    ...overrides
  };
}

function currentContext(
  overrides: Partial<CommercialLearningCurrentContextV1> = {}
): CommercialLearningCurrentContextV1 {
  return {
    decisionRef: "decision:current",
    domain: "PRICING",
    patternKey: "deposit-before-production",
    observedAt: currentObservedAt,
    truthState: "KNOWN",
    evidenceRefs: ["evidence:current:terms", "evidence:current:pattern"],
    applicationLinkEvidenceRefs: ["evidence:current:pattern"],
    ...overrides
  };
}

function input(
  sourceReview: RecurringDecisionLessonReviewV1 = recurringReview(),
  current: CommercialLearningCurrentContextV1 = currentContext(),
  overrides: Partial<CommercialLearningApplicationInputV1> = {}
): CommercialLearningApplicationInputV1 {
  return {
    source: {
      review: sourceReview,
      observedAt: sourceObservedAt,
      evidenceRefs: ["evidence:lesson:1"]
    },
    current,
    reviewedAt,
    ...overrides
  };
}

test("surfaces repeated pricing learning only as a current review context", () => {
  const value = reviewCommercialLearningApplicationV1(input());

  assert.equal(value.state, "READY_FOR_REVIEW");
  assert.deepEqual(value.reasonCodes, ["REPEATED_LESSON_READY_FOR_CURRENT_REVIEW"]);
  assert.equal(value.nextInternalStep, "REVIEW_LESSON_AGAINST_CURRENT_CONTEXT");
  assert.equal(value.confidence, "NOT_ESTABLISHED");
  assert.equal(value.recommendedPrice, null);
  assert.equal(value.recommendedNegotiationAction, null);
  assert.equal(value.monetaryValue, null);
  assert.equal(value.causalInterpretation, "NOT_ESTABLISHED");
  assert.deepEqual(value.authority, {
    analysisOnly: true,
    priceChangeAuthorized: false,
    negotiationActionAuthorized: false,
    externalActionAuthorized: false,
    persistenceAuthorized: false,
    policyPromotionAuthorized: false,
    confidenceMutationAuthorized: false,
    monetaryMutationAuthorized: false,
    approvalBypassAuthorized: false
  });
});

test("supports negotiation lessons without creating negotiation authority", () => {
  const value = reviewCommercialLearningApplicationV1(input(
    recurringReview({ domain: "NEGOTIATION", pattern_key: "scope-before-concession" }),
    currentContext({ domain: "NEGOTIATION", patternKey: "scope-before-concession" })
  ));

  assert.equal(value.state, "READY_FOR_REVIEW");
  assert.equal(value.domain, "NEGOTIATION");
  assert.equal(value.recommendedNegotiationAction, null);
  assert.equal(value.authority.negotiationActionAuthorized, false);
});

test("does nothing when recurring evidence is still insufficient", () => {
  const review = recurringReview({
    state: "INSUFFICIENT_INDEPENDENT_EVIDENCE",
    reason_code: "TOO_FEW_INDEPENDENT_OBSERVATIONS"
  });
  const value = reviewCommercialLearningApplicationV1(input(review));

  assert.equal(value.state, "NO_ACTION");
  assert.deepEqual(value.reasonCodes, ["INSUFFICIENT_RECURRING_EVIDENCE"]);
  assert.equal(value.nextInternalStep, null);
});

test("requires exact supported domain and pattern linkage", () => {
  const domainMismatch = reviewCommercialLearningApplicationV1(input(
    recurringReview({ domain: "PRICING" }),
    currentContext({ domain: "NEGOTIATION" })
  ));
  assert.equal(domainMismatch.state, "VERIFY");
  assert.ok(domainMismatch.reasonCodes.includes("CURRENT_DOMAIN_MISMATCH"));

  const patternMismatch = reviewCommercialLearningApplicationV1(input(
    recurringReview(),
    currentContext({ patternKey: "similar-but-not-exact" })
  ));
  assert.equal(patternMismatch.state, "VERIFY");
  assert.ok(patternMismatch.reasonCodes.includes("PATTERN_MISMATCH"));

  const unsupported = reviewCommercialLearningApplicationV1(input(
    recurringReview({ domain: "CAMPAIGN" }),
    currentContext()
  ));
  assert.equal(unsupported.state, "VERIFY");
  assert.ok(unsupported.reasonCodes.includes("SOURCE_DOMAIN_UNSUPPORTED"));
});

test("unknown, inferred, stale, and conflicted current truth all fail closed", () => {
  for (const truthState of ["UNKNOWN", "INFERRED", "STALE", "CONFLICTED"] as const) {
    const value = reviewCommercialLearningApplicationV1(input(
      recurringReview(),
      currentContext({ truthState })
    ));
    assert.equal(value.state, "VERIFY");
    assert.ok(value.reasonCodes.includes("CURRENT_CONTEXT_NOT_KNOWN"));
  }
});

test("application evidence must be explicit and belong to the current context", () => {
  const missing = reviewCommercialLearningApplicationV1(input(
    recurringReview(),
    currentContext({ applicationLinkEvidenceRefs: [] })
  ));
  assert.equal(missing.state, "VERIFY");
  assert.ok(missing.reasonCodes.includes("APPLICATION_LINK_EVIDENCE_MISSING"));

  const unrelated = reviewCommercialLearningApplicationV1(input(
    recurringReview(),
    currentContext({ applicationLinkEvidenceRefs: ["evidence:not-current"] })
  ));
  assert.equal(unrelated.state, "VERIFY");
  assert.ok(unrelated.reasonCodes.includes("APPLICATION_LINK_EVIDENCE_NOT_CURRENT"));
});

test("blocks circular reuse of a decision that helped create the recurring lesson", () => {
  const value = reviewCommercialLearningApplicationV1(input(
    recurringReview(),
    currentContext({ decisionRef: "decision:past:1" })
  ));

  assert.equal(value.state, "VERIFY");
  assert.ok(value.reasonCodes.includes("CURRENT_DECISION_REUSES_SOURCE_OBSERVATION"));
  assert.equal(value.nextInternalStep, null);
});

test("stale and future source or current evidence require verification", () => {
  const staleSource = reviewCommercialLearningApplicationV1(input(
    recurringReview(),
    currentContext(),
    {
      source: {
        review: recurringReview(),
        observedAt: "2025-01-01T00:00:00.000Z",
        evidenceRefs: ["evidence:lesson:1"]
      },
      maximumAgeMs: 30 * 24 * 60 * 60 * 1000
    }
  ));
  assert.equal(staleSource.state, "VERIFY");
  assert.ok(staleSource.reasonCodes.includes("SOURCE_REVIEW_STALE"));

  const futureCurrent = reviewCommercialLearningApplicationV1(input(
    recurringReview(),
    currentContext({ observedAt: "2027-01-01T00:00:00.000Z" })
  ));
  assert.equal(futureCurrent.state, "VERIFY");
  assert.ok(futureCurrent.reasonCodes.includes("CURRENT_CONTEXT_IN_FUTURE"));
});

test("tampered source authority or causal claims fail closed", () => {
  const authorityReview = {
    ...recurringReview(),
    pricing_change_allowed: true
  } as unknown as RecurringDecisionLessonReviewV1;
  const authority = reviewCommercialLearningApplicationV1(input(authorityReview));
  assert.equal(authority.state, "VERIFY");
  assert.ok(authority.reasonCodes.includes("SOURCE_AUTHORITY_INVARIANT_FAILED"));

  const causalReview = {
    ...recurringReview(),
    causal_interpretation: "CAUSAL"
  } as unknown as RecurringDecisionLessonReviewV1;
  const causal = reviewCommercialLearningApplicationV1(input(causalReview));
  assert.equal(causal.state, "VERIFY");
  assert.ok(causal.reasonCodes.includes("SOURCE_CAUSALITY_INVARIANT_FAILED"));
});

test("source envelope evidence must be shared with the reviewed lesson evidence", () => {
  const value = reviewCommercialLearningApplicationV1(input(
    recurringReview(),
    currentContext(),
    {
      source: {
        review: recurringReview(),
        observedAt: sourceObservedAt,
        evidenceRefs: ["evidence:unrelated-envelope"]
      }
    }
  ));

  assert.equal(value.state, "VERIFY");
  assert.ok(value.reasonCodes.includes("SOURCE_ENVELOPE_EVIDENCE_NOT_SHARED"));
});

test("output is deterministic, deeply immutable, and leaves caller input unchanged", () => {
  const original = input();
  const before = structuredClone(original);
  const first = reviewCommercialLearningApplicationV1(original);
  const second = reviewCommercialLearningApplicationV1(structuredClone(original));

  assert.deepEqual(first, second);
  assert.deepEqual(original, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.authority));
  assert.ok(Object.isFrozen(first.sourceDecisionRefs));
  assert.throws(() => (first.sourceDecisionRefs as string[]).push("decision:new"));
});
