import assert from "node:assert/strict";
import { test } from "node:test";

import type { AISearchAuthorityScorecardV1 } from "../src/lib/discovery-intelligence/ai-search-authority-scorecard-v1";
import {
  buildAISearchContentAuthorityPlanV1,
  type ContentAuthorityCandidateV1
} from "../src/lib/discovery-intelligence/ai-search-content-authority-plan-v1";

const NOW = "2026-09-19T19:30:00.000Z";

function scorecard(status: AISearchAuthorityScorecardV1["status"] = "READY"): AISearchAuthorityScorecardV1 {
  return {
    contractVersion: "AISearchAuthorityScorecardV1",
    status,
    coverage: {
      baselineGeneratedAt: "2026-09-19T18:00:00.000Z",
      evaluatedAt: "2026-09-19T19:00:00.000Z",
      baselineObservationCount: 1,
      freshObservedCount: 1,
      staleObservedCount: 0,
      unavailableCount: 0,
      notRunCount: 0,
      conflictCount: 0
    },
    overall: {
      freshObservedCount: 1,
      knownMentionDenominator: 1,
      mentionPresentCount: 0,
      mentionAbsentCount: 1,
      mentionUnknownCount: 0,
      mentionRate: 0,
      knownPositionDenominator: 0,
      firstMentionCount: 0,
      firstOrTop3MentionCount: 0,
      firstMentionRate: null,
      firstOrTop3MentionRate: null,
      knownCitationDenominator: 0,
      citedMentionCount: 0,
      uncitedMentionCount: 0,
      citationUnknownCount: 0,
      citationRate: null,
      knownEntityAccuracyDenominator: 0,
      accurateEntityMentionCount: 0,
      entityIssueCount: 0,
      entityAccuracyUnknownCount: 0,
      accurateEntityRate: null
    },
    segments: [],
    observedAuthorityGaps: [
      {
        gapId: "gap:hyperrealistic",
        kind: "OBSERVED_ABSENCE",
        observationId: "obs:1",
        queryId: "query:hyperrealistic",
        queryText: "best hyperrealistic pencil artists",
        queryFamily: "CATEGORY_BEST_OF",
        system: "CHATGPT",
        observedAt: "2026-09-19T18:00:00.000Z",
        evidenceRefs: ["evidence:ai-search:1"],
        observedCompetitorNames: ["Observed Artist"],
        causalClaim: false,
        competitorPerformanceClaim: false,
        endorsementClaim: false,
        relationshipClaim: false
      }
    ],
    measurementGaps: [],
    citationDomains: [],
    observedCompetitorContext: [],
    guardrails: [],
    syntheticScoreProduced: false,
    deterministicRankProduced: false,
    causalAttributionClaimed: false,
    competitorPerformanceInferred: false,
    endorsementInferred: false,
    relationshipInferred: false,
    monetaryValue: null,
    externalAccessPerformed: false,
    writesPerformed: false,
    publicPublishingPerformed: false
  };
}

function candidate(
  candidateId: string,
  orientation: ContentAuthorityCandidateV1["orientation"] = "KEEGAN_FIRST",
  overrides: Partial<ContentAuthorityCandidateV1> = {}
): ContentAuthorityCandidateV1 {
  return {
    candidateId,
    title: `Authority page ${candidateId}`,
    orientation,
    targetGapIds: ["gap:hyperrealistic"],
    audienceValue: "Explains Keegan's first-hand graphite process using documented project evidence.",
    existingKeeganEvidenceRefs: [`evidence:keegan:${candidateId}`],
    outline: ["Process", "Case study", "What collectors can look for"],
    factualClaimEvidenceRefs: [`evidence:claim:${candidateId}`],
    claimManifestComplete: true,
    internalLinkRefs: ["page:/artwork"],
    requiresExternalEvidence: false,
    externalEvidenceRefs: [],
    schemaOpportunities: ["Article"],
    commercialCta: "Explore available artwork",
    cannibalizationRisk: "LOW",
    competitorLeakageRisk: "LOW",
    competitorStorefrontOutboundLinks: [],
    evidenceRefs: [`evidence:brief:${candidateId}`],
    ...overrides
  };
}

test("content authority plan keeps the top-20 matrix at least 80% Keegan-first without synthetic scoring", () => {
  const candidates = [
    ...Array.from({ length: 20 }, (_, index) => candidate(`keegan-${index + 1}`)),
    ...Array.from({ length: 8 }, (_, index) => candidate(`category-${index + 1}`, "CATEGORY_HISTORY"))
  ];

  const plan = buildAISearchContentAuthorityPlanV1({ scorecard: scorecard(), candidates, now: NOW });

  assert.equal(plan.opportunityMatrix.length, 20);
  assert.equal(plan.counts.keeganFirstSelected, 16);
  assert.equal(plan.counts.categoryHistorySelected, 4);
  assert.equal(plan.commercialRule.observedKeeganFirstShare, 0.8);
  assert.equal(plan.commercialRule.satisfied, true);
  assert.equal(plan.counts.publish, 20);
  assert.equal(plan.implementationReadyTopFive.length, 5);
  assert.ok(plan.implementationReadyTopFive.every((item) => item.publicPublishingRequiresApproval));
  assert.ok(plan.implementationReadyTopFive.every((item) => item.publicPublishingAuthorized === false));
  assert.equal(plan.deterministicSyntheticScoreProduced, false);
  assert.equal(plan.expectedAuthorityLiftInferred, false);
  assert.equal(plan.publicPublishingPerformed, false);
});

test("content authority plan prepares incomplete evidence instead of inventing publish readiness", () => {
  const plan = buildAISearchContentAuthorityPlanV1({
    scorecard: scorecard(),
    candidates: [
      candidate("needs-external", "KEEGAN_FIRST", {
        requiresExternalEvidence: true,
        externalEvidenceRefs: [],
        claimManifestComplete: false
      })
    ],
    now: NOW
  });

  assert.equal(plan.opportunityMatrix[0]!.recommendation, "PREPARE");
  assert.deepEqual(plan.opportunityMatrix[0]!.issues, ["INCOMPLETE_CLAIM_MANIFEST", "MISSING_REQUIRED_EXTERNAL_EVIDENCE"]);
  assert.equal(plan.opportunityMatrix[0]!.implementationReadyBrief, false);
  assert.equal(plan.implementationReadyTopFive.length, 0);
});

test("competitor storefront leakage fails closed to SKIP", () => {
  const plan = buildAISearchContentAuthorityPlanV1({
    scorecard: scorecard(),
    candidates: [
      candidate("leaky-category", "CATEGORY_HISTORY", {
        competitorStorefrontOutboundLinks: ["https://competitor.example/shop"],
        competitorLeakageRisk: "HIGH"
      }),
      candidate("keegan-safe")
    ],
    now: NOW
  });

  const leaky = plan.opportunityMatrix.find((item) => item.candidateId === "leaky-category");
  assert.ok(leaky);
  assert.equal(leaky.recommendation, "SKIP");
  assert.ok(leaky.issues.includes("COMPETITOR_STOREFRONT_LINK_PRESENT"));
  assert.ok(leaky.issues.includes("HIGH_COMPETITOR_LEAKAGE_RISK"));
  assert.equal(plan.competitorStorefrontPromotionAuthorized, false);
});

test("insufficient AI-search evidence cannot produce a publish recommendation", () => {
  const plan = buildAISearchContentAuthorityPlanV1({
    scorecard: scorecard("INSUFFICIENT_EVIDENCE"),
    candidates: [candidate("good-brief")],
    now: NOW
  });

  assert.equal(plan.opportunityMatrix[0]!.recommendation, "PREPARE");
  assert.ok(plan.opportunityMatrix[0]!.issues.includes("SCORECARD_NOT_DECISION_READY"));
  assert.equal(plan.opportunityMatrix[0]!.expectedLift, null);
  assert.equal(plan.opportunityMatrix[0]!.monetaryValue, null);
});

test("unknown gap references remain verification work rather than fabricated authority contribution", () => {
  const plan = buildAISearchContentAuthorityPlanV1({
    scorecard: scorecard(),
    candidates: [candidate("unknown-gap", "KEEGAN_FIRST", { targetGapIds: ["gap:does-not-exist"] })],
    now: NOW
  });

  assert.equal(plan.opportunityMatrix[0]!.recommendation, "PREPARE");
  assert.equal(plan.opportunityMatrix[0]!.authorityContribution, "NOT_ESTABLISHED");
  assert.deepEqual(plan.opportunityMatrix[0]!.issues, ["NO_OBSERVED_AUTHORITY_GAP", "UNKNOWN_TARGET_GAP"]);
});

test("scorecard chronology cannot be replayed from the future", () => {
  const future = scorecard();
  future.coverage.evaluatedAt = "2026-09-20T00:00:00.000Z";
  assert.throws(
    () => buildAISearchContentAuthorityPlanV1({ scorecard: future, candidates: [], now: NOW }),
    /cannot be evaluated in the future/
  );
});
