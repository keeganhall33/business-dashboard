import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialContentInputV1,
  type SocialMetricKeyV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import { analyzeSocialContentDnaV1 } from "../../src/lib/social-intelligence/social-content-dna-v1";
import { compileSocialBusinessOutcomeLinkageV1 } from "../../src/lib/social-intelligence/social-business-outcome-linkage-v1";
import { compileSocialPeerPublicEvidenceV1 } from "../../src/lib/social-intelligence/social-peer-public-evidence-v1";
import { compileSocialContentOpportunityQueueV1 } from "../../src/lib/social-intelligence/social-content-opportunity-queue-v1";

const GENERATED_AT = "2026-09-18T14:00:00.000Z";
const METRICS: readonly SocialMetricKeyV1[] = [
  "REACH",
  "LIKES",
  "COMMENTS",
  "SHARES",
  "SAVES",
  "PROFILE_VISITS",
  "LINK_CLICKS"
];

function observed(value: number, ref: string) {
  return { value, evidenceRefs: [ref] };
}

function content(options: {
  id: string;
  format: string;
  likes: number;
  saves?: number;
  profileVisits?: number;
  linkClicks?: number;
  subject?: string;
  hook?: string;
}): SocialContentInputV1 {
  const prefix = `provider:${options.id}`;
  return {
    contentId: options.id,
    publishedAt: "2026-09-17T12:00:00.000Z",
    format: options.format,
    subject: options.subject ?? `subject-${options.id}`,
    hook: options.hook ?? `hook-${options.id}`,
    amplificationType: "ORGANIC",
    attributionConfidence: "DIRECT",
    metrics: {
      REACH: observed(1_000, `${prefix}:reach`),
      LIKES: observed(options.likes, `${prefix}:likes`),
      COMMENTS: observed(0, `${prefix}:comments`),
      SHARES: observed(0, `${prefix}:shares`),
      SAVES: observed(options.saves ?? 0, `${prefix}:saves`),
      PROFILE_VISITS: observed(options.profileVisits ?? 0, `${prefix}:profile-visits`),
      LINK_CLICKS: observed(options.linkClicks ?? 0, `${prefix}:link-clicks`)
    }
  };
}

function snapshot(options: {
  platform: "INSTAGRAM" | "YOUTUBE";
  accountId: string;
  lastSyncAt: string;
  rows: readonly SocialContentInputV1[];
}): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1({
    platform: options.platform,
    accountId: options.accountId,
    retrievedAt: options.lastSyncAt,
    sourceCoverage: {
      requestedState: "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: options.lastSyncAt,
      metricCoverage: METRICS
    },
    periods: [],
    content: options.rows
  }, GENERATED_AT, 48);
}

function instagramRows(highIntent = true): SocialContentInputV1[] {
  return [
    content({ id: "ig-time-1", format: "Timelapse", likes: 120, saves: highIntent ? 10 : 0, profileVisits: highIntent ? 8 : 0, linkClicks: highIntent ? 4 : 0 }),
    content({ id: "ig-time-2", format: "Timelapse", likes: 100, saves: highIntent ? 8 : 0, profileVisits: highIntent ? 6 : 0, linkClicks: highIntent ? 3 : 0 }),
    content({ id: "ig-still-1", format: "Still", likes: 10 }),
    content({ id: "ig-still-2", format: "Still", likes: 10 })
  ];
}

function youtubeRows(): SocialContentInputV1[] {
  return [
    content({ id: "yt-short", format: "Short", likes: 30, saves: 2, profileVisits: 2, linkClicks: 2 }),
    content({ id: "yt-long", format: "Long", likes: 20, saves: 2, profileVisits: 2, linkClicks: 1 }),
    content({ id: "yt-interview", format: "Interview", likes: 25, saves: 2, profileVisits: 2, linkClicks: 1 })
  ];
}

function contraryYoutubeRows(): SocialContentInputV1[] {
  return [
    content({ id: "yt-time-1", format: "Timelapse", likes: 5, linkClicks: 1 }),
    content({ id: "yt-time-2", format: "Timelapse", likes: 5, linkClicks: 1 }),
    content({ id: "yt-short-1", format: "Short", likes: 100, linkClicks: 5 }),
    content({ id: "yt-short-2", format: "Short", likes: 110, linkClicks: 5 })
  ];
}

function peerEvidence(asOf = GENERATED_AT) {
  return compileSocialPeerPublicEvidenceV1({
    asOf,
    observations: [
      {
        observationId: "peer-1",
        peerId: "peer-a",
        peerDisplayName: "Peer A",
        platform: "YOUTUBE",
        sourceKind: "PUBLIC_PLATFORM_PAGE",
        sourceRef: "https://example.com/peer-a/video-1",
        observedAt: "2026-09-16T12:00:00.000Z",
        capturedAt: "2026-09-17T12:00:00.000Z",
        contentId: "video-1",
        format: "Timelapse",
        evidenceRefs: ["public:peer-a:video-1"]
      },
      {
        observationId: "peer-2",
        peerId: "peer-a",
        peerDisplayName: "Peer A",
        platform: "YOUTUBE",
        sourceKind: "PUBLIC_PLATFORM_PAGE",
        sourceRef: "https://example.com/peer-a/video-2",
        observedAt: "2026-09-15T12:00:00.000Z",
        capturedAt: "2026-09-17T12:00:00.000Z",
        contentId: "video-2",
        format: "Timelapse",
        evidenceRefs: ["public:peer-a:video-2"]
      }
    ]
  });
}

function directOutcome(snapshots: readonly CanonicalSocialAccountSnapshotV1[]) {
  return compileSocialBusinessOutcomeLinkageV1({
    generatedAt: GENERATED_AT,
    socialSnapshots: snapshots,
    outcomes: [
      {
        outcomeId: "session-1",
        kind: "SITE_SESSION",
        source: "GA4",
        sourceRecordRef: "ga4:session-1",
        occurredAt: "2026-09-17T13:00:00.000Z",
        observedAt: "2026-09-18T13:00:00.000Z",
        completeThroughAt: "2026-09-18T13:30:00.000Z",
        truthState: "KNOWN",
        evidenceRefs: ["ga4:event:session-1"],
        socialContentRef: { platform: "INSTAGRAM", contentId: "ig-time-1" },
        linkEvidence: {
          basis: "EXACT_TRACKING_REF",
          attributionRef: "utm:ig-time-1",
          evidenceRefs: ["ga4:utm:ig-time-1"]
        }
      }
    ]
  });
}

function emptyOutcome(snapshots: readonly CanonicalSocialAccountSnapshotV1[]) {
  return compileSocialBusinessOutcomeLinkageV1({
    generatedAt: GENERATED_AT,
    socialSnapshots: snapshots,
    outcomes: []
  });
}

test("ranks a cross-platform adaptation from first-party business evidence and keeps peer observations non-performance context", () => {
  const ig = snapshot({
    platform: "INSTAGRAM",
    accountId: "keegan-ig",
    lastSyncAt: "2026-09-18T13:30:00.000Z",
    rows: instagramRows(true)
  });
  const yt = snapshot({
    platform: "YOUTUBE",
    accountId: "keegan-yt",
    lastSyncAt: "2026-09-18T13:20:00.000Z",
    rows: youtubeRows()
  });
  const snapshots = [ig, yt];
  const dna = analyzeSocialContentDnaV1(snapshots);

  const result = compileSocialContentOpportunityQueueV1({
    generatedAt: GENERATED_AT,
    dna,
    snapshots,
    outcomeLinkage: directOutcome(snapshots),
    peerEvidence: peerEvidence(),
    maxSourceAgeHours: 24,
    maxPeerEvidenceAgeHours: 48
  });

  const candidate = result.opportunities.find((row) =>
    row.sourcePlatform === "INSTAGRAM" &&
    row.targetPlatform === "YOUTUBE" &&
    row.sourceDimension === "FORMAT" &&
    row.observedMechanism === "Timelapse"
  );

  assert.ok(candidate);
  assert.equal(candidate?.priority, "DIRECT_TRACKED_BUSINESS_SIGNAL");
  assert.equal(candidate?.targetSuccessMetric, "LINK_CLICKS");
  assert.equal(candidate?.formatDirection, "Timelapse");
  assert.equal(candidate?.hookDirection, null);
  assert.equal(candidate?.directTrackedOutcomeCount, 1);
  assert.ok((candidate?.highIntentSupportingContentCount ?? 0) >= 1);
  assert.equal(candidate?.confidence, null);
  assert.equal(candidate?.confidenceReason, "NOT_ESTIMATED_FROM_THIS_EVIDENCE");
  assert.equal(candidate?.causalClaim, false);
  assert.equal(candidate?.revenueAttributionClaim, false);
  assert.equal(candidate?.competitorPerformanceClaim, false);
  assert.equal(candidate?.executionAuthority, "NONE");
  assert.equal(candidate?.publicPostingRequiresApproval, true);
  assert.match(candidate?.experimentPlan ?? "", /approval-gated YOUTUBE test/i);
  assert.match(candidate?.successMetricPlan ?? "", /does not invent a threshold/i);

  assert.equal(candidate?.peerContext.length, 1);
  assert.equal(candidate?.peerContext[0]?.peerDisplayName, "Peer A");
  assert.equal(candidate?.peerContext[0]?.performanceClaim, false);
  assert.equal(candidate?.peerContext[0]?.relationshipClaim, false);
  assert.equal(candidate?.peerContext[0]?.causalClaim, false);
  assert.match(candidate?.peerContext[0]?.statement ?? "", /not performance/i);
  assert.match(result.rankingPolicy.join(" "), /Peer observations never increase rank/i);
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("suppresses a high-engagement pattern when it has only vanity evidence", () => {
  const ig = snapshot({
    platform: "INSTAGRAM",
    accountId: "keegan-ig",
    lastSyncAt: "2026-09-18T13:30:00.000Z",
    rows: instagramRows(false)
  });
  const yt = snapshot({
    platform: "YOUTUBE",
    accountId: "keegan-yt",
    lastSyncAt: "2026-09-18T13:20:00.000Z",
    rows: youtubeRows()
  });
  const snapshots = [ig, yt];
  const result = compileSocialContentOpportunityQueueV1({
    generatedAt: GENERATED_AT,
    dna: analyzeSocialContentDnaV1(snapshots),
    snapshots,
    outcomeLinkage: emptyOutcome(snapshots),
    peerEvidence: null,
    maxSourceAgeHours: 24,
    maxPeerEvidenceAgeHours: 48
  });

  assert.equal(result.opportunities.some((row) => row.observedMechanism === "Timelapse"), false);
  assert.ok(result.suppressions.some((row) =>
    row.sourcePlatform === "INSTAGRAM" &&
    row.sourceDimension === "FORMAT" &&
    row.observedMechanism === "Timelapse" &&
    row.reason === "VANITY_ONLY_SIGNAL"
  ));
});

test("re-checks source freshness at queue time instead of trusting an earlier FRESH label", () => {
  const ig = snapshot({
    platform: "INSTAGRAM",
    accountId: "keegan-ig",
    lastSyncAt: "2026-09-18T13:30:00.000Z",
    rows: instagramRows(true)
  });
  const yt = snapshot({
    platform: "YOUTUBE",
    accountId: "keegan-yt",
    lastSyncAt: "2026-09-18T12:00:00.000Z",
    rows: youtubeRows()
  });
  const snapshots = [ig, yt];
  const result = compileSocialContentOpportunityQueueV1({
    generatedAt: GENERATED_AT,
    dna: analyzeSocialContentDnaV1(snapshots),
    snapshots,
    outcomeLinkage: directOutcome(snapshots),
    peerEvidence: null,
    maxSourceAgeHours: 1,
    maxPeerEvidenceAgeHours: 48
  });

  assert.equal(result.opportunities.some((row) => row.targetPlatform === "YOUTUBE"), false);
  assert.ok(result.suppressions.some((row) =>
    row.sourcePlatform === "INSTAGRAM" &&
    row.reason === "NO_DECISION_GRADE_TARGET"
  ));
});

test("does not recommend a transfer when the target platform already has contrary first-party evidence", () => {
  const ig = snapshot({
    platform: "INSTAGRAM",
    accountId: "keegan-ig",
    lastSyncAt: "2026-09-18T13:30:00.000Z",
    rows: instagramRows(true)
  });
  const yt = snapshot({
    platform: "YOUTUBE",
    accountId: "keegan-yt",
    lastSyncAt: "2026-09-18T13:20:00.000Z",
    rows: contraryYoutubeRows()
  });
  const snapshots = [ig, yt];
  const result = compileSocialContentOpportunityQueueV1({
    generatedAt: GENERATED_AT,
    dna: analyzeSocialContentDnaV1(snapshots),
    snapshots,
    outcomeLinkage: directOutcome(snapshots),
    peerEvidence: null,
    maxSourceAgeHours: 24,
    maxPeerEvidenceAgeHours: 48
  });

  assert.equal(result.opportunities.some((row) =>
    row.sourcePlatform === "INSTAGRAM" && row.targetPlatform === "YOUTUBE" && row.observedMechanism === "Timelapse"
  ), false);
  assert.ok(result.suppressions.some((row) =>
    row.sourcePlatform === "INSTAGRAM" &&
    row.targetPlatform === "YOUTUBE" &&
    row.observedMechanism === "Timelapse" &&
    row.reason === "TARGET_HAS_CONTRARY_FIRST_PARTY_EVIDENCE"
  ));
});

test("stale peer evidence is excluded rather than converted into current competitor context", () => {
  const ig = snapshot({
    platform: "INSTAGRAM",
    accountId: "keegan-ig",
    lastSyncAt: "2026-09-18T13:30:00.000Z",
    rows: instagramRows(true)
  });
  const yt = snapshot({
    platform: "YOUTUBE",
    accountId: "keegan-yt",
    lastSyncAt: "2026-09-18T13:20:00.000Z",
    rows: youtubeRows()
  });
  const snapshots = [ig, yt];
  const result = compileSocialContentOpportunityQueueV1({
    generatedAt: GENERATED_AT,
    dna: analyzeSocialContentDnaV1(snapshots),
    snapshots,
    outcomeLinkage: directOutcome(snapshots),
    peerEvidence: peerEvidence("2026-09-17T14:00:00.000Z"),
    maxSourceAgeHours: 24,
    maxPeerEvidenceAgeHours: 12
  });

  const candidate = result.opportunities.find((row) =>
    row.sourcePlatform === "INSTAGRAM" && row.targetPlatform === "YOUTUBE" && row.observedMechanism === "Timelapse"
  );
  assert.ok(candidate);
  assert.deepEqual(candidate?.peerContext, []);
  assert.match(result.limitations.join(" "), /Peer evidence is outside the configured freshness window/i);
});

test("is deterministic, deeply immutable, bounded, and rejects ambiguous per-platform account selection", () => {
  const ig = snapshot({
    platform: "INSTAGRAM",
    accountId: "keegan-ig",
    lastSyncAt: "2026-09-18T13:30:00.000Z",
    rows: instagramRows(true)
  });
  const yt = snapshot({
    platform: "YOUTUBE",
    accountId: "keegan-yt",
    lastSyncAt: "2026-09-18T13:20:00.000Z",
    rows: youtubeRows()
  });
  const snapshots = [ig, yt];
  const input = {
    generatedAt: GENERATED_AT,
    dna: analyzeSocialContentDnaV1(snapshots),
    snapshots,
    outcomeLinkage: directOutcome(snapshots),
    peerEvidence: peerEvidence(),
    maxSourceAgeHours: 24,
    maxPeerEvidenceAgeHours: 48
  } as const;
  const before = structuredClone(input);
  const first = compileSocialContentOpportunityQueueV1(input);
  const second = compileSocialContentOpportunityQueueV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.opportunities), true);
  assert.equal(Object.isFrozen(first.opportunities[0]), true);
  assert.equal(Object.isFrozen(first.opportunities[0]?.peerContext), true);
  assert.ok(first.opportunities.length <= 50);

  assert.throws(() => compileSocialContentOpportunityQueueV1({
    ...input,
    snapshots: [ig, { ...ig, accountId: "another-account" }]
  }), /duplicate platform snapshot requires explicit account selection/i);
});
