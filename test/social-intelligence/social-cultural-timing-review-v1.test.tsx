import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialCulturalTimingReviewV1,
  type SocialExternalTimingObservationInputV1
} from "../../src/lib/social-intelligence/social-cultural-timing-review-v1";
import type { SocialContentOpportunityQueueV1 } from "../../src/lib/social-intelligence/social-content-opportunity-queue-v1";

const generatedAt = "2026-09-18T13:00:00Z";

function queue(
  subjectDirection = "Seattle Seahawks",
  status: SocialContentOpportunityQueueV1["status"] = "READY"
): SocialContentOpportunityQueueV1 {
  return {
    contractVersion: "SocialContentOpportunityQueueV1",
    generatedAt: "2026-09-18T12:00:00Z",
    status,
    opportunities: status === "INSUFFICIENT_EVIDENCE" ? [] : [
      {
        opportunityId: "opportunity-1",
        rank: 1,
        priority: "HIGH_INTENT_FIRST_PARTY_SIGNAL",
        sourcePlatform: "INSTAGRAM",
        targetPlatform: "YOUTUBE",
        sourceDimension: "SUBJECT",
        observedMechanism: subjectDirection,
        sourcePatternRelativeToMedian: 1.25,
        supportingContentRefs: ["INSTAGRAM:content-1"],
        firstPartyEvidenceRefs: ["evidence:first-party-content"],
        linkedOutcomeCount: 0,
        directTrackedOutcomeCount: 0,
        highIntentSupportingContentCount: 2,
        targetSuccessMetric: "PROFILE_VISITS",
        formatDirection: null,
        hookDirection: null,
        subjectDirection,
        experimentPlan: "Run an approval-gated cross-platform test.",
        successMetricPlan: "Predeclare profile visits as the success metric.",
        peerContext: [],
        confidence: null,
        confidenceReason: "NOT_ESTIMATED_FROM_THIS_EVIDENCE",
        causalClaim: false,
        revenueAttributionClaim: false,
        competitorPerformanceClaim: false,
        publicPostingRequiresApproval: true,
        executionAuthority: "NONE"
      }
    ],
    suppressions: [],
    limitations: [],
    rankingPolicy: [],
    postingAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  };
}

function observation(
  observationId: string,
  overrides: Partial<SocialExternalTimingObservationInputV1> = {}
): SocialExternalTimingObservationInputV1 {
  return {
    observationId,
    signalId: "signal-seahawks-game",
    signalKind: "SPORT_EVENT",
    subject: "Seattle Seahawks",
    sourceKind: "OFFICIAL_SCHEDULE",
    sourceRef: "public:official-seahawks-schedule",
    observedAt: "2026-09-18T11:00:00Z",
    capturedAt: "2026-09-18T12:00:00Z",
    windowStartAt: "2026-09-20T12:00:00Z",
    windowEndAt: "2026-09-20T16:00:00Z",
    evidenceRefs: [`evidence:${observationId}`],
    ...overrides
  };
}

const policy = {
  maxObservationAgeHours: 24,
  lookaheadHours: 72,
  minIndependentPublicSources: 2
} as const;

test("adds official cultural timing context without reranking or claiming performance", () => {
  const result = compileSocialCulturalTimingReviewV1({
    generatedAt,
    queue: queue(),
    observations: [observation("official-1")],
    policy
  });

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.state, "CURRENT_SUPPORTED");
  assert.equal(result.signals[0]?.supportBasis, "OFFICIAL_SOURCE");
  assert.equal(result.signals[0]?.hoursUntilWindowStart, 47);

  const review = result.opportunityReviews[0];
  assert.equal(review?.state, "READY_FOR_TIMING_REVIEW");
  assert.equal(review?.existingRank, 1);
  assert.equal(review?.rankChanged, false);
  assert.equal(review?.alertReviewCandidate, true);
  assert.equal(review?.expectedPerformance, null);
  assert.equal(review?.causalClaim, false);
  assert.equal(review?.attributionClaim, false);
  assert.equal(review?.competitorPerformanceClaim, false);
  assert.equal(review?.relationshipClaim, false);
  assert.equal(review?.endorsementClaim, false);
  assert.equal(review?.executionAuthority, "NONE");
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.signals), true);
});

test("requires caller-supplied independent public corroboration when no official source exists", () => {
  const first = observation("news-1", {
    sourceKind: "PUBLIC_NEWS_REPORT",
    sourceRef: "public:news-source-a"
  });

  const insufficient = compileSocialCulturalTimingReviewV1({
    generatedAt,
    queue: queue(),
    observations: [first],
    policy
  });
  assert.equal(insufficient.status, "VERIFY_REQUIRED");
  assert.equal(insufficient.signals[0]?.state, "VERIFY_REQUIRED");
  assert.equal(insufficient.signals[0]?.supportBasis, "INSUFFICIENT_CURRENT_SUPPORT");
  assert.equal(insufficient.opportunityReviews[0]?.state, "VERIFY_REQUIRED");
  assert.equal(insufficient.opportunityReviews[0]?.alertReviewCandidate, false);

  const supported = compileSocialCulturalTimingReviewV1({
    generatedAt,
    queue: queue(),
    observations: [
      first,
      observation("calendar-1", {
        sourceKind: "PUBLIC_EVENT_CALENDAR",
        sourceRef: "public:event-calendar-b"
      })
    ],
    policy
  });
  assert.equal(supported.status, "READY_FOR_REVIEW");
  assert.equal(supported.signals[0]?.state, "CURRENT_SUPPORTED");
  assert.equal(supported.signals[0]?.supportBasis, "INDEPENDENT_PUBLIC_SOURCES");
  assert.equal(supported.signals[0]?.independentCurrentSourceCount, 2);
});

test("uses exact normalized subject matching and never invents semantic relevance", () => {
  const result = compileSocialCulturalTimingReviewV1({
    generatedAt,
    queue: queue("Seahawks"),
    observations: [observation("official-1")],
    policy
  });

  assert.equal(result.status, "NO_CURRENT_SIGNAL");
  assert.equal(result.opportunityReviews[0]?.state, "NO_CURRENT_TIMING_SIGNAL");
  assert.deepEqual(result.unmatchedSupportedSignalIds, ["signal-seahawks-game"]);
  assert.match(result.limitations.join(" "), /exact normalized subject matching only/i);
});

test("withholds stale timing evidence and supported events outside the lookahead window", () => {
  const stale = compileSocialCulturalTimingReviewV1({
    generatedAt,
    queue: queue(),
    observations: [
      observation("stale-1", {
        observedAt: "2026-09-10T10:00:00Z",
        capturedAt: "2026-09-10T11:00:00Z"
      })
    ],
    policy
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.equal(stale.signals[0]?.state, "STALE_ONLY");
  assert.equal(stale.opportunityReviews[0]?.state, "VERIFY_REQUIRED");
  assert.equal(stale.opportunityReviews[0]?.alertReviewCandidate, false);

  const outside = compileSocialCulturalTimingReviewV1({
    generatedAt,
    queue: queue(),
    observations: [
      observation("later-1", {
        signalId: "signal-later",
        windowStartAt: "2026-10-01T12:00:00Z",
        windowEndAt: "2026-10-01T16:00:00Z"
      })
    ],
    policy
  });
  assert.equal(outside.signals[0]?.state, "CURRENT_SUPPORTED");
  assert.equal(outside.signals[0]?.withinLookahead, false);
  assert.equal(outside.status, "NO_CURRENT_SIGNAL");
  assert.equal(outside.opportunityReviews[0]?.alertReviewCandidate, false);
});

test("fails closed when sources disagree about one signal identity or provenance is unsafe", () => {
  assert.throws(
    () => compileSocialCulturalTimingReviewV1({
      generatedAt,
      queue: queue(),
      observations: [
        observation("source-a"),
        observation("source-b", { windowStartAt: "2026-09-20T13:00:00Z" })
      ],
      policy
    }),
    /conflicting external timing identity/i
  );

  assert.throws(
    () => compileSocialCulturalTimingReviewV1({
      generatedAt,
      queue: queue(),
      observations: [observation("secret", { sourceRef: "https://example.com/event?access_token=secret" })],
      policy
    }),
    /secret-like provenance/i
  );

  assert.throws(
    () => compileSocialCulturalTimingReviewV1({
      generatedAt,
      queue: queue(),
      observations: [observation("missing-evidence", { evidenceRefs: [] })],
      policy
    }),
    /requires public\/compliant evidence/i
  );
});

test("rejects future collection, bad chronology, duplicate observations, and invalid policy", () => {
  assert.throws(
    () => compileSocialCulturalTimingReviewV1({
      generatedAt,
      queue: queue(),
      observations: [observation("future", { capturedAt: "2026-09-18T14:00:00Z" })],
      policy
    }),
    /capturedAt cannot be after generatedAt/i
  );

  assert.throws(
    () => compileSocialCulturalTimingReviewV1({
      generatedAt,
      queue: queue(),
      observations: [observation("chronology", { observedAt: "2026-09-18T12:30:00Z" })],
      policy
    }),
    /observedAt cannot be after capturedAt/i
  );

  assert.throws(
    () => compileSocialCulturalTimingReviewV1({
      generatedAt,
      queue: queue(),
      observations: [observation("same"), observation("same", { signalId: "different" })],
      policy
    }),
    /duplicate observationId/i
  );

  assert.throws(
    () => compileSocialCulturalTimingReviewV1({
      generatedAt,
      queue: queue(),
      observations: [],
      policy: { ...policy, minIndependentPublicSources: 0 }
    }),
    /positive integer/i
  );
});

test("preserves upstream insufficient-evidence truth rather than creating urgency", () => {
  const result = compileSocialCulturalTimingReviewV1({
    generatedAt,
    queue: queue("Seattle Seahawks", "INSUFFICIENT_EVIDENCE"),
    observations: [observation("official-1")],
    policy
  });

  assert.equal(result.status, "UPSTREAM_INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.opportunityReviews, []);
  assert.equal(result.signals[0]?.state, "CURRENT_SUPPORTED");
  assert.deepEqual(result.unmatchedSupportedSignalIds, ["signal-seahawks-game"]);
});
