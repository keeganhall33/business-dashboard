import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCompanyBrainRecurringLessonsBriefV1,
  type CompanyBrainRecurringLessonSourceV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-recurring-lessons-brief-v1";
import {
  RECURRING_DECISION_LESSONS_VERSION,
  type RecurringDecisionLessonReviewV1
} from "../../../src/lib/intelligence/organizational-learning/recurring-decision-lessons-v1";

function reviewCandidate(
  overrides: Partial<RecurringDecisionLessonReviewV1> = {}
): RecurringDecisionLessonReviewV1 {
  return {
    version: RECURRING_DECISION_LESSONS_VERSION,
    state: "REVIEW_CANDIDATE",
    reason_code: "REPEATED_APPROVED_LESSON",
    domain: "PRICING",
    pattern_key: "hold-documented-price-when-concession-evidence-is-missing",
    lesson_title: "Documented price holds require evidence before concessions",
    lesson_content: "Repeated approved lessons support reviewing the documented price before making an unsupported concession.",
    source_learning_ids: ["learning:pricing-1", "learning:pricing-2"],
    decision_refs: ["decision:pricing-1", "decision:pricing-2"],
    outcome_refs: ["outcome:pricing-1", "outcome:pricing-2"],
    evidence_refs: ["evidence:pricing-1", "evidence:pricing-2"],
    source_lineage_ids: ["source:deal-1", "source:deal-2"],
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

function source(
  sourceId: string,
  review: RecurringDecisionLessonReviewV1,
  evaluatedAt = "2026-09-19T00:10:00.000Z"
): CompanyBrainRecurringLessonSourceV1 {
  return { sourceId, evaluatedAt, review };
}

function compile(sources: readonly CompanyBrainRecurringLessonSourceV1[]) {
  return compileCompanyBrainRecurringLessonsBriefV1({
    sources,
    generatedAt: "2026-09-19T00:20:00.000Z",
    maximumSourceAgeMs: 60 * 60 * 1000
  });
}

test("surfaces recurring pricing and negotiation lessons without promoting them", () => {
  const pricing = reviewCandidate();
  const negotiation = reviewCandidate({
    domain: "NEGOTIATION",
    pattern_key: "verify-budget-before-changing-structure",
    lesson_title: "Verify budget evidence before changing structure",
    lesson_content: "Repeated approved lessons support reviewing documented budget evidence before changing a negotiation structure.",
    source_learning_ids: ["learning:negotiation-1", "learning:negotiation-2"],
    decision_refs: ["decision:negotiation-1", "decision:negotiation-2"],
    outcome_refs: ["outcome:negotiation-1", "outcome:negotiation-2"],
    evidence_refs: ["evidence:negotiation-1", "evidence:negotiation-2"],
    source_lineage_ids: ["source:negotiation-1", "source:negotiation-2"]
  });
  const insufficient = reviewCandidate({
    state: "INSUFFICIENT_INDEPENDENT_EVIDENCE",
    reason_code: "TOO_FEW_INDEPENDENT_OBSERVATIONS",
    domain: "CAMPAIGN",
    pattern_key: "campaign-format-pattern",
    lesson_title: "Campaign pattern under review",
    lesson_content: "The available evidence is not yet independently repeated.",
    source_learning_ids: ["learning:campaign-1"],
    decision_refs: ["decision:campaign-1"],
    outcome_refs: ["outcome:campaign-1"],
    evidence_refs: ["evidence:campaign-1"],
    source_lineage_ids: ["source:campaign-1"],
    verification_reasons: ["INSUFFICIENT_SOURCE_INDEPENDENCE"]
  });
  const unsafe = reviewCandidate({
    state: "NEEDS_VERIFICATION",
    reason_code: "UNSAFE_SOURCE_LESSON",
    domain: "STRATEGY",
    pattern_key: "strategy-pattern",
    lesson_title: "Strategy source needs verification",
    lesson_content: "The source lesson requires verification before recurring review.",
    source_learning_ids: ["learning:strategy-1"],
    decision_refs: ["decision:strategy-1"],
    outcome_refs: ["outcome:strategy-1"],
    evidence_refs: ["evidence:strategy-1"],
    source_lineage_ids: ["source:strategy-1"],
    verification_reasons: ["SOURCE_LESSON_NOT_APPROVED"]
  });

  const result = compile([
    source("source-review:unsafe", unsafe, "2026-09-19T00:08:00.000Z"),
    source("source-review:pricing", pricing, "2026-09-19T00:12:00.000Z"),
    source("source-review:campaign", insufficient, "2026-09-19T00:09:00.000Z"),
    source("source-review:negotiation", negotiation, "2026-09-19T00:11:00.000Z")
  ]);

  assert.equal(result.state, "READY");
  assert.equal(result.summary.supplied, 4);
  assert.equal(result.summary.accepted, 4);
  assert.equal(result.summary.reviewCandidates, 2);
  assert.equal(result.summary.evidenceNeeded, 1);
  assert.equal(result.summary.verificationRequired, 1);
  assert.equal(result.summary.pricingPatternsForReview, 1);
  assert.equal(result.summary.negotiationPatternsForReview, 1);
  assert.deepEqual(
    result.reviewCandidates.map((item) => item.sourceId),
    ["source-review:pricing", "source-review:negotiation"]
  );
  assert.equal(result.reviewCandidates[0]?.independentDecisionCount, 2);
  assert.equal(result.reviewCandidates[0]?.independentOutcomeCount, 2);
  assert.equal(result.reviewCandidates[0]?.independentSourceLineageCount, 2);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.authority.lessonPromotionAuthorized, false);
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.pricingChangeAuthorized, false);
  assert.equal(result.authority.negotiationActionAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("fails closed on stale, future, widened-authority, and duplicate sources", () => {
  const widened = {
    ...reviewCandidate({
      domain: "NEGOTIATION",
      pattern_key: "widened-authority"
    }),
    policy_promotion_allowed: true
  } as unknown as RecurringDecisionLessonReviewV1;

  const result = compile([
    source("source-review:duplicate", reviewCandidate()),
    source("source-review:duplicate", reviewCandidate({ pattern_key: "other-pattern" })),
    source(
      "source-review:stale",
      reviewCandidate({ pattern_key: "stale-pattern" }),
      "2026-09-18T20:00:00.000Z"
    ),
    source(
      "source-review:future",
      reviewCandidate({ pattern_key: "future-pattern" }),
      "2026-09-19T00:30:00.000Z"
    ),
    source("source-review:widened", widened)
  ]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.rejected, 5);
  assert.ok(result.sourceVerificationReasons.includes("DUPLICATE_SOURCE_ID:source-review:duplicate"));
  assert.ok(result.sourceVerificationReasons.includes("SOURCE_REVIEW_STALE:source-review:stale"));
  assert.ok(result.sourceVerificationReasons.includes("SOURCE_EVALUATED_IN_FUTURE:source-review:future"));
  assert.ok(result.sourceVerificationReasons.includes("SOURCE_AUTHORITY_WIDENED:source-review:widened"));
  assert.deepEqual(result.rejectedSourceIds, [
    "source-review:duplicate",
    "source-review:future",
    "source-review:stale",
    "source-review:widened"
  ]);
});

test("rejects a forged review candidate that lacks independent recurring evidence", () => {
  const forged = reviewCandidate({
    source_learning_ids: ["learning:one"],
    decision_refs: ["decision:one"],
    outcome_refs: ["outcome:one"],
    source_lineage_ids: ["source:one"]
  });

  const result = compile([source("source-review:forged", forged)]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.ok(
    result.sourceVerificationReasons.includes(
      "REVIEW_CANDIDATE_INDEPENDENCE_INVALID:source-review:forged"
    )
  );
});

test("rejects duplicate pattern reviews rather than counting one pattern twice", () => {
  const first = reviewCandidate();
  const second = reviewCandidate({
    source_learning_ids: ["learning:pricing-3", "learning:pricing-4"],
    decision_refs: ["decision:pricing-3", "decision:pricing-4"],
    outcome_refs: ["outcome:pricing-3", "outcome:pricing-4"],
    evidence_refs: ["evidence:pricing-3", "evidence:pricing-4"],
    source_lineage_ids: ["source:deal-3", "source:deal-4"]
  });

  const result = compile([
    source("source-review:first", first, "2026-09-19T00:12:00.000Z"),
    source("source-review:second", second, "2026-09-19T00:11:00.000Z")
  ]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 1);
  assert.equal(result.summary.rejected, 1);
  assert.ok(
    result.sourceVerificationReasons.includes(
      "DUPLICATE_PATTERN_REVIEW:PRICING:hold-documented-price-when-concession-evidence-is-missing"
    )
  );
  assert.equal(result.reviewCandidates.length, 1);
});

test("deep-freezes the brief and preserves caller-owned review objects", () => {
  const inputReview = reviewCandidate();
  const before = structuredClone(inputReview);
  const result = compile([source("source-review:pricing", inputReview)]);

  assert.deepEqual(inputReview, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reviewCandidates), true);
  assert.equal(Object.isFrozen(result.reviewCandidates[0]), true);
  assert.equal(Object.isFrozen(result.reviewCandidates[0]?.evidenceRefs), true);
  assert.equal(Object.isFrozen(result.authority), true);
});
