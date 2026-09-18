import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialPeerPublicEvidenceV1,
  type SocialPeerCoverageWindowInputV1,
  type SocialPeerPublicEvidenceV1,
  type SocialPeerPublicObservationInputV1
} from "../../src/lib/social-intelligence/social-peer-public-evidence-v1";
import {
  compileSocialPeerShiftReviewV1,
  type SocialPeerShiftPolicyV1
} from "../../src/lib/social-intelligence/social-peer-shift-review-v1";

const priorAsOf = "2026-09-04T00:00:00Z";
const currentAsOf = "2026-09-18T00:00:00Z";
const evaluatedAt = "2026-09-18T08:00:00Z";
const priorWindow = {
  startAt: "2026-08-21T00:00:00Z",
  endAt: "2026-09-04T00:00:00Z"
};
const currentWindow = {
  startAt: "2026-09-04T00:00:00Z",
  endAt: "2026-09-18T00:00:00Z"
};

const policy: SocialPeerShiftPolicyV1 = {
  maxCurrentEvidenceAgeHours: 24,
  maxWindowGapHours: 1,
  minDistinctPostsForPattern: 2,
  minAbsoluteCadenceDeltaPerWeek: 1
};

type ObservationSpec = Readonly<{
  id: string;
  contentId: string;
  observedAt: string;
  format?: string | null;
  seriesLabel?: string | null;
  hookText?: string | null;
  titlePattern?: string | null;
  visibleParticipant?: string | null;
  peerDisplayName?: string;
  sourceRef?: string;
}>;

function evidence(
  asOf: string,
  window: typeof priorWindow,
  rows: readonly ObservationSpec[],
  coverage: SocialPeerCoverageWindowInputV1["coverage"] = "COMPLETE_PUBLIC_TIMELINE"
): SocialPeerPublicEvidenceV1 {
  const observations: SocialPeerPublicObservationInputV1[] = rows.map((row) => ({
    observationId: row.id,
    peerId: "peer-a",
    peerDisplayName: row.peerDisplayName ?? "Peer A",
    platform: "INSTAGRAM",
    sourceKind: "PUBLIC_PLATFORM_PAGE",
    sourceRef: row.sourceRef ?? `public:peer-a:${row.contentId}`,
    observedAt: row.observedAt,
    capturedAt: asOf,
    contentId: row.contentId,
    format: row.format ?? null,
    seriesLabel: row.seriesLabel ?? null,
    hookText: row.hookText ?? null,
    titlePattern: row.titlePattern ?? null,
    visibleParticipant: row.visibleParticipant ?? null,
    evidenceRefs: [`evidence:${row.id}`]
  }));

  return compileSocialPeerPublicEvidenceV1({
    asOf,
    observations,
    coverageWindows: [{
      peerId: "peer-a",
      platform: "INSTAGRAM",
      startAt: window.startAt,
      endAt: window.endAt,
      coverage,
      evidenceRefs: [`coverage:${window.startAt}:${window.endAt}`]
    }]
  });
}

function baselinePrior(): SocialPeerPublicEvidenceV1 {
  return evidence(priorAsOf, priorWindow, [
    {
      id: "prior-1",
      contentId: "prior-post-1",
      observedAt: "2026-08-24T12:00:00Z",
      format: "process reel",
      hookText: "close-up reveal"
    },
    {
      id: "prior-2",
      contentId: "prior-post-2",
      observedAt: "2026-08-30T12:00:00Z",
      format: "finished artwork",
      hookText: "finished reveal"
    }
  ]);
}

function currentWithEmergingPattern(): SocialPeerPublicEvidenceV1 {
  return evidence(currentAsOf, currentWindow, [
    {
      id: "current-1",
      contentId: "current-post-1",
      observedAt: "2026-09-05T12:00:00Z",
      format: "process reel",
      hookText: "close-up reveal"
    },
    {
      id: "current-2",
      contentId: "current-post-2",
      observedAt: "2026-09-07T12:00:00Z",
      format: "process reel",
      hookText: "close-up reveal"
    },
    {
      id: "current-3",
      contentId: "current-post-3",
      observedAt: "2026-09-09T12:00:00Z",
      format: "process reel",
      hookText: "studio opening"
    },
    {
      id: "current-4",
      contentId: "current-post-4",
      observedAt: "2026-09-11T12:00:00Z",
      format: "finished artwork",
      hookText: "finished reveal"
    },
    {
      id: "current-5",
      contentId: "current-post-5",
      observedAt: "2026-09-13T12:00:00Z",
      format: "finished artwork",
      hookText: "finished reveal"
    },
    {
      id: "current-6",
      contentId: "current-post-6",
      observedAt: "2026-09-15T12:00:00Z",
      format: "finished artwork",
      hookText: "finished reveal"
    }
  ]);
}

test("surfaces public pattern and cadence shifts from complete comparable windows without inventing performance", () => {
  const result = compileSocialPeerShiftReviewV1({
    prior: baselinePrior(),
    current: currentWithEmergingPattern(),
    policy,
    evaluatedAt
  });

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.comparisonCoverage.comparedIdentityCount, 1);
  assert.equal(result.comparisonCoverage.skippedIdentityCount, 0);

  const pattern = result.items.find((item) =>
    item.kind === "PATTERN_EMERGED" && item.dimension === "FORMAT" && item.value === "process reel"
  );
  assert.ok(pattern);
  assert.equal(pattern.priorObservedCount, 1);
  assert.equal(pattern.currentObservedCount, 3);
  assert.equal(pattern.performanceClaim, false);
  assert.equal(pattern.audienceGrowthClaim, false);
  assert.equal(pattern.relationshipClaim, false);
  assert.equal(pattern.endorsementClaim, false);
  assert.equal(pattern.attributionClaim, false);
  assert.match(pattern.statement, /public content-pattern observation only/i);

  const cadence = result.items.find((item) => item.kind === "CADENCE_INCREASED");
  assert.ok(cadence);
  assert.equal(cadence.priorPostsPerWeek, 1);
  assert.equal(cadence.currentPostsPerWeek, 3);
  assert.match(cadence.statement, /does not establish content performance, audience growth, strategy, causality, or future behavior/i);

  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.paidMediaAuthority, "NONE");
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("can surface observed pattern recession without treating it as performance decline", () => {
  const prior = evidence(priorAsOf, priorWindow, [
    {
      id: "prior-1",
      contentId: "prior-post-1",
      observedAt: "2026-08-24T12:00:00Z",
      seriesLabel: "weekly studio"
    },
    {
      id: "prior-2",
      contentId: "prior-post-2",
      observedAt: "2026-08-30T12:00:00Z",
      seriesLabel: "weekly studio"
    }
  ]);
  const current = evidence(currentAsOf, currentWindow, [
    {
      id: "current-1",
      contentId: "current-post-1",
      observedAt: "2026-09-08T12:00:00Z",
      seriesLabel: "weekly studio"
    },
    {
      id: "current-2",
      contentId: "current-post-2",
      observedAt: "2026-09-14T12:00:00Z",
      seriesLabel: "collector story"
    }
  ]);

  const result = compileSocialPeerShiftReviewV1({ prior, current, policy, evaluatedAt });
  const receded = result.items.find((item) => item.kind === "PATTERN_RECEDED" && item.dimension === "SERIES");
  assert.ok(receded);
  assert.equal(receded.priorObservedCount, 2);
  assert.equal(receded.currentObservedCount, 1);
  assert.equal(receded.performanceClaim, false);
  assert.match(receded.statement, /does not establish performance, audience growth, causality, endorsement, sponsorship, or any relationship/i);
});

test("requires complete equal-duration non-overlapping public windows and never interprets missing coverage as change", () => {
  const prior = evidence(priorAsOf, priorWindow, [
    {
      id: "prior-1",
      contentId: "prior-post-1",
      observedAt: "2026-08-24T12:00:00Z",
      format: "process reel"
    }
  ], "PARTIAL");
  const current = currentWithEmergingPattern();

  const result = compileSocialPeerShiftReviewV1({ prior, current, policy, evaluatedAt });
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.items, []);
  assert.equal(result.comparisonCoverage.comparedIdentityCount, 0);
  assert.equal(result.comparisonCoverage.skippedIdentityCount, 1);
  assert.match(result.guardrails.join(" "), /absence from one snapshot or incomplete public coverage is never interpreted/i);
});

test("fails closed to verification when current canonical evidence is stale or upstream truth is not ready", () => {
  const prior = baselinePrior();
  const current = currentWithEmergingPattern();

  const stale = compileSocialPeerShiftReviewV1({
    prior,
    current,
    policy: { ...policy, maxCurrentEvidenceAgeHours: 2 },
    evaluatedAt
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.deepEqual(stale.items, []);
  assert.deepEqual(stale.verificationReasons, ["CURRENT_EVIDENCE_STALE"]);

  const partialPrior: SocialPeerPublicEvidenceV1 = { ...prior, status: "PARTIAL" };
  const partial = compileSocialPeerShiftReviewV1({ prior: partialPrior, current, policy, evaluatedAt });
  assert.equal(partial.status, "VERIFY_REQUIRED");
  assert.equal(partial.verificationReasons.includes("PRIOR_EVIDENCE_NOT_READY"), true);
  assert.deepEqual(partial.items, []);
});

test("excludes visible participants from shift detection so appearance never becomes relationship or endorsement intelligence", () => {
  const prior = evidence(priorAsOf, priorWindow, [
    {
      id: "prior-1",
      contentId: "prior-post-1",
      observedAt: "2026-08-24T12:00:00Z",
      format: "photo",
      visibleParticipant: "Person A"
    },
    {
      id: "prior-2",
      contentId: "prior-post-2",
      observedAt: "2026-08-30T12:00:00Z",
      format: "photo",
      visibleParticipant: "Person B"
    }
  ]);
  const current = evidence(currentAsOf, currentWindow, [
    {
      id: "current-1",
      contentId: "current-post-1",
      observedAt: "2026-09-08T12:00:00Z",
      format: "photo",
      visibleParticipant: "Named celebrity"
    },
    {
      id: "current-2",
      contentId: "current-post-2",
      observedAt: "2026-09-14T12:00:00Z",
      format: "photo",
      visibleParticipant: "Named celebrity"
    }
  ]);

  const result = compileSocialPeerShiftReviewV1({ prior, current, policy, evaluatedAt });
  assert.equal(result.status, "NO_MATERIAL_SHIFT");
  assert.deepEqual(result.items, []);
  assert.match(result.guardrails.join(" "), /visible participants are deliberately excluded/i);
});

test("rejects cross-snapshot identity conflicts, secret-like provenance, and widened upstream authority", () => {
  const prior = baselinePrior();
  const differentIdentity = evidence(currentAsOf, currentWindow, [
    {
      id: "current-1",
      contentId: "current-post-1",
      observedAt: "2026-09-08T12:00:00Z",
      format: "photo",
      peerDisplayName: "Different Peer"
    },
    {
      id: "current-2",
      contentId: "current-post-2",
      observedAt: "2026-09-14T12:00:00Z",
      format: "photo",
      peerDisplayName: "Different Peer"
    }
  ]);
  assert.throws(
    () => compileSocialPeerShiftReviewV1({ prior, current: differentIdentity, policy, evaluatedAt }),
    /conflicting peer identity across snapshots/i
  );

  const unsafe = evidence(currentAsOf, currentWindow, [
    {
      id: "current-unsafe",
      contentId: "current-post-unsafe",
      observedAt: "2026-09-10T12:00:00Z",
      format: "photo",
      sourceRef: "https://example.test/feed?access_token=do-not-persist"
    }
  ]);
  assert.throws(
    () => compileSocialPeerShiftReviewV1({ prior, current: unsafe, policy, evaluatedAt }),
    /credential-like material/i
  );

  const widened = { ...currentWithEmergingPattern(), writesPerformed: true } as unknown as SocialPeerPublicEvidenceV1;
  assert.throws(
    () => compileSocialPeerShiftReviewV1({ prior, current: widened, policy, evaluatedAt }),
    /widens upstream authority/i
  );
});

test("is deterministic, deeply immutable, and grants no notification, posting, or paid-media authority", () => {
  const input = {
    prior: baselinePrior(),
    current: currentWithEmergingPattern(),
    policy,
    evaluatedAt
  } as const;
  const before = JSON.stringify(input);
  const first = compileSocialPeerShiftReviewV1(input);
  const second = compileSocialPeerShiftReviewV1(input);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);
  assert.equal(first.items.every((item) => Object.isFrozen(item)), true);
  assert.equal(first.notificationAuthority, "NONE");
  assert.equal(first.paidMediaAuthority, "NONE");
  assert.equal(first.postingAuthority, "NONE");
});
