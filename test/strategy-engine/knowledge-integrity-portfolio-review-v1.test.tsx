import assert from "node:assert/strict";
import test from "node:test";

import type { KnowledgeIntegrityFindingV1 } from "@/lib/intelligence/knowledge-compilation/knowledge-integrity-v1";
import type { DecisionPortfolioV1 } from "@/lib/strategy-engine/decision-portfolio-v1";
import {
  reviewKnowledgeIntegrityForPortfolioV1,
  type KnowledgeIntegrityPortfolioReviewInputV1
} from "@/lib/strategy-engine/knowledge-integrity-portfolio-review-v1";

const PORTFOLIO_AT = "2026-09-18T16:00:00.000Z";
const FINDING_AT = "2026-09-18T16:30:00.000Z";
const REVIEWED_AT = "2026-09-18T17:00:00.000Z";
const LINK_EVIDENCE = "evidence:integrity-link";

function portfolio(overrides: Partial<DecisionPortfolioV1> = {}): DecisionPortfolioV1 {
  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt: PORTFOLIO_AT,
    portfolioId: "portfolio:current",
    items: [
      {
        candidate: {
          id: "decision:campaign-steering",
          title: "Campaign steering decision",
          candidateType: "DECISION",
          owner: "KEEGAN",
          approvalClass: "KEEGAN",
          evidenceState: "KNOWN",
          evidenceRefs: [LINK_EVIDENCE, "evidence:decision-current"],
          sourceRefs: ["source:strategy-current"],
          monetaryCase: null,
          value: {
            strategicFit: 80,
            compoundingAdvantage: 70,
            relationshipAccess: 40,
            futureOptions: 60,
            learningValue: 70,
            urgency: 50,
            reversibility: 80
          },
          risk: { execution: 20, reputation: 20, rights: 10 },
          resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 3, cashCents: 0 },
          dependencyIds: [],
          conflictKeys: [],
          blockers: [],
          informationGainAction: null,
          safeNextStep: "Prepare the decision evidence for review.",
          successMetric: "Decision evidence remains current and internally consistent",
          evaluationWindow: {
            start: "2026-09-18T00:00:00.000Z",
            end: "2026-10-18T00:00:00.000Z"
          }
        },
        disposition: "SELECTED",
        score: {
          monetaryExpectedCents: null,
          monetaryScore: 0,
          strategicScore: 72,
          riskPenalty: 12,
          totalScore: 60,
          components: {}
        },
        rank: 1,
        rationale: "Current evidence supports review priority.",
        exclusionReason: null,
        displacedBy: []
      }
    ],
    selectedIds: ["decision:campaign-steering"],
    ownerQueues: { KEEGAN: ["decision:campaign-steering"], IOANA: [], JEEVES: [] },
    keeganDecisionIds: ["decision:campaign-steering"],
    informationGainIds: [],
    usedCapacity: { keeganHours: 1, ioanaHours: 0, jeevesHours: 3, cashCents: 0 },
    remainingCapacity: { keeganHours: 4, ioanaHours: 4, jeevesHours: 12, cashCents: 0 },
    evidenceRefs: ["evidence:portfolio"],
    sourceRefs: ["source:portfolio"],
    audit: {
      candidatesConsidered: 1,
      feasiblePortfoliosEvaluated: 1,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true
    },
    ...overrides
  };
}

function finding(overrides: Partial<KnowledgeIntegrityFindingV1> = {}): KnowledgeIntegrityFindingV1 {
  return {
    contract_version: "KNOWLEDGE_INTEGRITY_V1",
    finding_id: "finding:strategy-conflict",
    finding_type: "CONTRADICTORY_FACT",
    severity: "BLOCKING",
    affected_canonical_ids: ["decision:campaign-steering"],
    evidence_refs: [LINK_EVIDENCE, "evidence:conflict-direct"],
    source_lineage_refs: ["source:strategy-current", "source:conflicting-direct"],
    truth_state: "CONFLICTED",
    freshness_state: "FRESH",
    business_impact: "ACTIVE_DECISION",
    time_state: "NOT_TIME_SENSITIVE",
    direct_evidence: true,
    reason_code: "MATERIAL_FACT_DISAGREEMENT",
    recommended_next_step: "REVIEW_CONFLICT",
    review_required: true,
    first_seen: "2026-09-18T16:20:00.000Z",
    observed_at: FINDING_AT,
    ...overrides
  };
}

function validInput(overrides: Partial<KnowledgeIntegrityPortfolioReviewInputV1> = {}): KnowledgeIntegrityPortfolioReviewInputV1 {
  return {
    portfolio: portfolio(),
    findings: [finding()],
    targetLinks: [
      {
        findingId: "finding:strategy-conflict",
        candidateId: "decision:campaign-steering",
        evidenceRefs: [LINK_EVIDENCE]
      }
    ],
    reviewedAt: REVIEWED_AT,
    maximumFindingAgeMs: 2 * 60 * 60 * 1000,
    ...overrides
  };
}

test("blocking direct integrity evidence pauses action for bounded candidate revalidation only", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput());
  const reviewItem = result.items[0];

  assert.equal(reviewItem.state, "REVALIDATE_BEFORE_ACTION");
  assert.deepEqual(reviewItem.reasonCodes, ["BLOCKING_KNOWLEDGE_INTEGRITY_FINDING"]);
  assert.equal(reviewItem.previousDisposition, "SELECTED");
  assert.equal(reviewItem.nextInternalStep, "REVALIDATE_CANONICAL_CANDIDATE_BEFORE_ACTION");
  assert.equal(reviewItem.confidence, "NOT_ESTABLISHED");
  assert.equal(reviewItem.monetaryValue, null);
  assert.equal(reviewItem.outcomePrediction, null);
  assert.equal(reviewItem.causalInterpretation, "NOT_ESTABLISHED");
  assert.deepEqual(result.summary, {
    linkedFindings: 1,
    revalidateBeforeAction: 1,
    reviewRequired: 0,
    verifyRequired: 0,
    noAction: 0,
    blocked: 0
  });
  assert.deepEqual(result.authority, {
    analysisOnly: true,
    portfolioMutationAuthorized: false,
    allocationChangeAuthorized: false,
    scoreMutationAuthorized: false,
    confidenceMutationAuthorized: false,
    monetaryMutationAuthorized: false,
    campaignExecutionAuthorized: false,
    experimentExecutionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationActionAuthorized: false,
    persistenceAuthorized: false,
    externalActionAuthorized: false,
    approvalBypassAuthorized: false,
    causalAttributionAuthorized: false
  });
});

test("important evidence also requests revalidation without choosing a new disposition", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ severity: "IMPORTANT", finding_type: "MISSING_PROVENANCE", reason_code: "AUTHORITATIVE_PROVENANCE_MISSING", recommended_next_step: "RESTORE_PROVENANCE" })]
  }));

  assert.equal(result.items[0].state, "REVALIDATE_BEFORE_ACTION");
  assert.deepEqual(result.items[0].reasonCodes, ["IMPORTANT_KNOWLEDGE_INTEGRITY_FINDING"]);
  assert.equal(result.items[0].previousDisposition, "SELECTED");
});

test("review-severity evidence remains an internal review signal", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ severity: "REVIEW", finding_type: "UNRESOLVED_LEARNING_REVIEW", reason_code: "LEARNING_AWAITS_GOVERNED_REVIEW", recommended_next_step: "REVIEW_LEARNING" })]
  }));

  assert.equal(result.items[0].state, "REVIEW_REQUIRED");
  assert.deepEqual(result.items[0].reasonCodes, ["KNOWLEDGE_INTEGRITY_REVIEW_REQUIRED"]);
  assert.equal(result.items[0].nextInternalStep, "REVIEW_KNOWLEDGE_INTEGRITY_IMPACT");
});

test("a finding with no supported decision impact cannot create portfolio attention", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ severity: "INFO", business_impact: "NONE", review_required: false })]
  }));

  assert.equal(result.items[0].state, "NO_ACTION");
  assert.deepEqual(result.items[0].reasonCodes, ["FINDING_NOT_DECISION_RELEVANT"]);
  assert.equal(result.items[0].nextInternalStep, null);
});

test("exact canonical linkage is required and fuzzy identity is never inferred", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ affected_canonical_ids: ["decision:similarly-named"] })]
  }));

  assert.equal(result.items[0].state, "VERIFY_REQUIRED");
  assert.ok(result.items[0].reasonCodes.includes("TARGET_LINK_MISMATCH"));
});

test("link evidence must be shared by the current candidate and integrity finding", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    targetLinks: [
      {
        findingId: "finding:strategy-conflict",
        candidateId: "decision:campaign-steering",
        evidenceRefs: ["evidence:unshared"]
      }
    ]
  }));

  assert.equal(result.items[0].state, "VERIFY_REQUIRED");
  assert.ok(result.items[0].reasonCodes.includes("TARGET_LINK_EVIDENCE_NOT_SHARED"));
});

test("stale integrity evidence requires refresh instead of silently steering current allocation", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ observed_at: "2026-09-10T16:30:00.000Z", first_seen: "2026-09-10T16:20:00.000Z" })],
    maximumFindingAgeMs: 24 * 60 * 60 * 1000
  }));

  assert.equal(result.items[0].state, "VERIFY_REQUIRED");
  assert.ok(result.items[0].reasonCodes.includes("FINDING_STALE"));
  assert.equal(result.items[0].nextInternalStep, "VERIFY_KNOWLEDGE_INTEGRITY_EVIDENCE");
});

test("future-dated integrity evidence is blocked", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ observed_at: "2026-09-18T18:00:00.000Z", first_seen: "2026-09-18T17:30:00.000Z" })]
  }));

  assert.equal(result.items[0].state, "BLOCKED");
  assert.ok(result.items[0].reasonCodes.includes("FINDING_IN_FUTURE"));
  assert.equal(result.items[0].nextInternalStep, null);
});

test("blocking severity without direct evidence fails closed to verification", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ direct_evidence: false })]
  }));

  assert.equal(result.items[0].state, "VERIFY_REQUIRED");
  assert.ok(result.items[0].reasonCodes.includes("FINDING_DIRECT_EVIDENCE_REQUIRED"));
});

test("non-informational severity cannot bypass its governed review flag", () => {
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding({ review_required: false })]
  }));

  assert.equal(result.items[0].state, "VERIFY_REQUIRED");
  assert.ok(result.items[0].reasonCodes.includes("FINDING_REVIEW_FLAG_INVARIANT_FAILED"));
});

test("duplicate finding identity fails closed rather than multiplying strategic attention", () => {
  const duplicated = finding();
  const result = reviewKnowledgeIntegrityForPortfolioV1(validInput({
    findings: [finding(), duplicated]
  }));

  assert.equal(result.items[0].state, "BLOCKED");
  assert.ok(result.items[0].reasonCodes.includes("FINDING_DUPLICATED"));
});

test("output is deterministic, sorted, and deeply immutable", () => {
  const secondFinding = finding({
    finding_id: "finding:owner",
    finding_type: "UNKNOWN_OWNER",
    severity: "REVIEW",
    reason_code: "ACCOUNTABLE_OWNER_UNKNOWN",
    recommended_next_step: "ASSIGN_OWNER",
    evidence_refs: [LINK_EVIDENCE, "evidence:owner"],
    source_lineage_refs: ["source:strategy-current", "source:owner"]
  });
  const input = validInput({
    findings: [secondFinding, finding()],
    targetLinks: [
      { findingId: "finding:owner", candidateId: "decision:campaign-steering", evidenceRefs: [LINK_EVIDENCE] },
      { findingId: "finding:strategy-conflict", candidateId: "decision:campaign-steering", evidenceRefs: [LINK_EVIDENCE] }
    ]
  });

  const first = reviewKnowledgeIntegrityForPortfolioV1(input);
  const second = reviewKnowledgeIntegrityForPortfolioV1({
    ...input,
    findings: [...input.findings].reverse(),
    targetLinks: [...input.targetLinks].reverse()
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.items.map((reviewItem) => reviewItem.findingId), [
    "finding:owner",
    "finding:strategy-conflict"
  ]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);
  assert.equal(Object.isFrozen(first.items[0]), true);
});
