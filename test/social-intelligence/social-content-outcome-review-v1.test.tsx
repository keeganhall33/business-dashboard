import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialSourceHealthStateV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialBusinessOutcomeLinkageV1,
  type SocialOutcomeLinkBasisV1
} from "../../src/lib/social-intelligence/social-business-outcome-linkage-v1";
import type { SocialContentOpportunityQueueV1 } from "../../src/lib/social-intelligence/social-content-opportunity-queue-v1";
import { compileSocialContentOutcomeReviewV1 } from "../../src/lib/social-intelligence/social-content-outcome-review-v1";

const QUEUE_AT = "2026-09-18T14:00:00.000Z";
const EVALUATED_AT = "2026-09-18T18:00:00.000Z";

function observed(value: number, ref: string) {
  return { value, evidenceRefs: [ref] };
}

function queue(): SocialContentOpportunityQueueV1 {
  return {
    contractVersion: "SocialContentOpportunityQueueV1",
    generatedAt: QUEUE_AT,
    status: "READY",
    opportunities: [{
      opportunityId: "social-content-opportunity-1",
      rank: 1,
      priority: "DIRECT_TRACKED_BUSINESS_SIGNAL",
      sourcePlatform: "INSTAGRAM",
      targetPlatform: "YOUTUBE",
      sourceDimension: "FORMAT",
      observedMechanism: "Timelapse",
      sourcePatternRelativeToMedian: 2.1,
      supportingContentRefs: ["INSTAGRAM:ig-time-1", "INSTAGRAM:ig-time-2"],
      firstPartyEvidenceRefs: ["provider:ig:time-1", "ga4:utm:ig-time-1"],
      linkedOutcomeCount: 1,
      directTrackedOutcomeCount: 1,
      highIntentSupportingContentCount: 2,
      targetSuccessMetric: "LINK_CLICKS",
      formatDirection: "Timelapse",
      hookDirection: null,
      subjectDirection: null,
      experimentPlan: "Prepare an approval-gated YouTube test of the observed format.",
      successMetricPlan: "Measure link clicks against a separately defined success criterion; do not invent a threshold.",
      peerContext: [],
      confidence: null,
      confidenceReason: "NOT_ESTIMATED_FROM_THIS_EVIDENCE",
      causalClaim: false,
      revenueAttributionClaim: false,
      competitorPerformanceClaim: false,
      publicPostingRequiresApproval: true,
      executionAuthority: "NONE"
    }],
    suppressions: [],
    limitations: ["No causal attribution."],
    rankingPolicy: ["First-party business evidence outranks vanity engagement."],
    postingAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  };
}

function targetSnapshot(options?: {
  requestedState?: SocialSourceHealthStateV1;
  retrievedAt?: string;
  lastSuccessfulSyncAt?: string | null;
  targetPublishedAt?: string;
  targetClicks?: number;
  targetEvidence?: readonly string[];
  baselineClicks?: number;
  baselineEvidence?: readonly string[];
}): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1({
    platform: "YOUTUBE",
    accountId: "keegan-youtube",
    retrievedAt: options?.retrievedAt ?? "2026-09-18T17:30:00.000Z",
    sourceCoverage: {
      requestedState: options?.requestedState ?? "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: options?.lastSuccessfulSyncAt === undefined
        ? "2026-09-18T17:30:00.000Z"
        : options.lastSuccessfulSyncAt,
      metricCoverage: ["LINK_CLICKS", "PROFILE_VISITS", "SAVES", "REACH"]
    },
    periods: [],
    content: [
      {
        contentId: "yt-baseline",
        publishedAt: "2026-09-17T12:00:00.000Z",
        format: "Short",
        amplificationType: "ORGANIC",
        attributionConfidence: "DIRECT",
        metrics: {
          LINK_CLICKS: { value: options?.baselineClicks ?? 10, evidenceRefs: options?.baselineEvidence ?? ["provider:yt:baseline:clicks"] },
          PROFILE_VISITS: observed(8, "provider:yt:baseline:profile-visits"),
          SAVES: observed(4, "provider:yt:baseline:saves"),
          REACH: observed(1_000, "provider:yt:baseline:reach")
        }
      },
      {
        contentId: "yt-adapted",
        publishedAt: options?.targetPublishedAt ?? "2026-09-18T15:00:00.000Z",
        format: "Timelapse",
        amplificationType: "ORGANIC",
        attributionConfidence: "DIRECT",
        metrics: {
          LINK_CLICKS: { value: options?.targetClicks ?? 18, evidenceRefs: options?.targetEvidence ?? ["provider:yt:adapted:clicks"] },
          PROFILE_VISITS: observed(20, "provider:yt:adapted:profile-visits"),
          SAVES: observed(12, "provider:yt:adapted:saves"),
          REACH: observed(1_500, "provider:yt:adapted:reach")
        }
      }
    ]
  }, EVALUATED_AT, 48);
}

function outcomeLinkage(
  snapshot: CanonicalSocialAccountSnapshotV1,
  basis: SocialOutcomeLinkBasisV1 = "EXACT_TRACKING_REF"
) {
  return compileSocialBusinessOutcomeLinkageV1({
    generatedAt: "2026-09-18T17:45:00.000Z",
    socialSnapshots: [snapshot],
    outcomes: [{
      outcomeId: "site-session-yt-adapted",
      kind: "SITE_SESSION",
      source: "GA4",
      sourceRecordRef: "ga4:session:yt-adapted",
      occurredAt: "2026-09-18T16:00:00.000Z",
      observedAt: "2026-09-18T17:40:00.000Z",
      completeThroughAt: "2026-09-18T17:40:00.000Z",
      truthState: "KNOWN",
      evidenceRefs: ["ga4:event:yt-adapted"],
      socialContentRef: { platform: "YOUTUBE", contentId: "yt-adapted" },
      linkEvidence: {
        basis,
        attributionRef: basis === "EXACT_TRACKING_REF" ? "utm:yt-adapted" : "campaign:yt-adapted",
        evidenceRefs: ["ga4:link:yt-adapted"]
      }
    }]
  });
}

function review(options?: {
  snapshot?: CanonicalSocialAccountSnapshotV1;
  executionEvidenceRefs?: readonly string[];
  criterion?: Parameters<typeof compileSocialContentOutcomeReviewV1>[0]["criterion"];
  outcomeBasis?: SocialOutcomeLinkBasisV1;
}) {
  const snapshot = options?.snapshot ?? targetSnapshot();
  return compileSocialContentOutcomeReviewV1({
    queue: queue(),
    opportunityId: "social-content-opportunity-1",
    targetSnapshot: snapshot,
    targetContentId: "yt-adapted",
    outcomeLinkage: outcomeLinkage(snapshot, options?.outcomeBasis),
    executionEvidenceRefs: options?.executionEvidenceRefs ?? ["action-log:approved-and-posted:yt-adapted"],
    evaluatedAt: EVALUATED_AT,
    maxSourceAgeHours: 4,
    criterion: options?.criterion
  });
}

test("turns an observed target post into governed review only when an explicit criterion and fresh evidence support it", () => {
  const result = review({ criterion: { kind: "MINIMUM_VALUE", atLeast: 15 } });

  assert.equal(result.status, "REVIEW_READY");
  assert.equal(result.targetPlatform, "YOUTUBE");
  assert.equal(result.targetContentRef, "YOUTUBE:yt-adapted");
  assert.equal(result.targetMetric, "LINK_CLICKS");
  assert.equal(result.observedMetricValue, 18);
  assert.equal(result.criterionState, "MET");
  assert.equal(result.reviewCandidate, "GOVERNED_LEARNING_REVIEW");
  assert.equal(result.linkedOutcomes.linkedOutcomeCount, 1);
  assert.equal(result.linkedOutcomes.directTrackedOutcomeCount, 1);
  assert.equal(result.linkedOutcomes.strongestAttributionClass, "DIRECT_TRACKED");
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.competitorPerformanceClaim, false);
  assert.equal(result.durableLearningAllowed, false);
  assert.equal(result.futurePriorUpdateAllowed, false);
  assert.equal(result.publicPostingAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.match(result.limitations.join(" "), /not proof/i);
});

test("refuses to manufacture a winner when no success criterion was defined", () => {
  const result = review();

  assert.equal(result.status, "REVIEW_READY");
  assert.equal(result.criterion, null);
  assert.equal(result.criterionState, "NOT_DEFINED");
  assert.equal(result.reviewCandidate, "NONE");
  assert.equal(result.observedMetricValue, 18);
  assert.equal(result.futurePriorUpdateAllowed, false);
});

test("computes caller-defined lift against an evidenced prior target-platform baseline without claiming causality", () => {
  const result = review({
    criterion: { kind: "MINIMUM_ABSOLUTE_LIFT", atLeast: 5, baselineContentId: "yt-baseline" },
    outcomeBasis: "EXACT_CAMPAIGN_REF"
  });

  assert.equal(result.status, "REVIEW_READY");
  assert.equal(result.baselineContentRef, "YOUTUBE:yt-baseline");
  assert.equal(result.baselineMetricValue, 10);
  assert.equal(result.absoluteLift, 8);
  assert.equal(result.percentageLift, 80);
  assert.equal(result.criterionState, "MET");
  assert.equal(result.linkedOutcomes.strongestAttributionClass, "SUPPORTED_ASSOCIATION");
  assert.equal(result.linkedOutcomes.directTrackedOutcomeCount, 0);
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
});

test("fails closed when the target social source is partial or stale at review time", () => {
  const partial = targetSnapshot({ requestedState: "CONNECTED_PARTIAL" });
  const partialResult = review({ snapshot: partial, criterion: { kind: "MINIMUM_VALUE", atLeast: 15 } });
  assert.equal(partialResult.status, "VERIFY_REQUIRED");
  assert.equal(partialResult.verificationReasons.includes("TARGET_SOURCE_NOT_DECISION_GRADE"), true);
  assert.equal(partialResult.criterionState, "UNVERIFIABLE");
  assert.equal(partialResult.reviewCandidate, "NONE");

  const stale = targetSnapshot({ retrievedAt: "2026-09-18T10:00:00.000Z", lastSuccessfulSyncAt: "2026-09-18T10:00:00.000Z" });
  const staleResult = review({ snapshot: stale, criterion: { kind: "MINIMUM_VALUE", atLeast: 15 } });
  assert.equal(staleResult.status, "VERIFY_REQUIRED");
  assert.equal(staleResult.verificationReasons.includes("TARGET_SNAPSHOT_TOO_OLD"), true);
  assert.equal(staleResult.reviewCandidate, "NONE");
});

test("requires explicit action evidence and refuses content that predates the recommendation", () => {
  const missingExecution = review({ executionEvidenceRefs: [], criterion: { kind: "MINIMUM_VALUE", atLeast: 15 } });
  assert.equal(missingExecution.status, "VERIFY_REQUIRED");
  assert.equal(missingExecution.verificationReasons.includes("EXECUTION_EVIDENCE_MISSING"), true);

  const predating = targetSnapshot({ targetPublishedAt: "2026-09-18T13:00:00.000Z" });
  const predatingResult = review({ snapshot: predating, criterion: { kind: "MINIMUM_VALUE", atLeast: 15 } });
  assert.equal(predatingResult.status, "VERIFY_REQUIRED");
  assert.equal(predatingResult.verificationReasons.includes("TARGET_CONTENT_PREDATES_RECOMMENDATION"), true);
});

test("keeps percentage lift unverifiable when the evidenced baseline denominator is zero", () => {
  const zeroBaseline = targetSnapshot({ baselineClicks: 0 });
  const result = review({
    snapshot: zeroBaseline,
    criterion: { kind: "MINIMUM_PERCENTAGE_LIFT", atLeast: 20, baselineContentId: "yt-baseline" }
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.percentageLift, null);
  assert.equal(result.verificationReasons.includes("BASELINE_ZERO_FOR_PERCENTAGE"), true);
  assert.equal(result.criterionState, "UNVERIFIABLE");
  assert.equal(result.reviewCandidate, "NONE");
});

test("requires target metric truth and evidence instead of treating missing data as zero", () => {
  const noEvidence = targetSnapshot({ targetEvidence: [] });
  const result = review({ snapshot: noEvidence, criterion: { kind: "MINIMUM_VALUE", atLeast: 15 } });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.verificationReasons.includes("TARGET_METRIC_EVIDENCE_MISSING"), true);
  assert.equal(result.criterionState, "UNVERIFIABLE");
});

test("is deterministic, deeply immutable, and preserves caller input", () => {
  const sourceQueue = queue();
  const sourceSnapshot = targetSnapshot();
  const sourceLinkage = outcomeLinkage(sourceSnapshot);
  const beforeQueue = structuredClone(sourceQueue);
  const beforeSnapshot = structuredClone(sourceSnapshot);
  const beforeLinkage = structuredClone(sourceLinkage);
  const input = {
    queue: sourceQueue,
    opportunityId: "social-content-opportunity-1",
    targetSnapshot: sourceSnapshot,
    targetContentId: "yt-adapted",
    outcomeLinkage: sourceLinkage,
    executionEvidenceRefs: ["action-log:approved-and-posted:yt-adapted"],
    evaluatedAt: EVALUATED_AT,
    maxSourceAgeHours: 4,
    criterion: { kind: "MINIMUM_VALUE" as const, atLeast: 15 }
  };

  const first = compileSocialContentOutcomeReviewV1(input);
  const second = compileSocialContentOutcomeReviewV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(sourceQueue, beforeQueue);
  assert.deepEqual(sourceSnapshot, beforeSnapshot);
  assert.deepEqual(sourceLinkage, beforeLinkage);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.linkedOutcomes), true);
  assert.equal(Object.isFrozen(first.observationEvidenceRefs), true);
});
