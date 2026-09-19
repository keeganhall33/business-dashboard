import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialContentInputV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialPeerPublicEvidenceV1,
  type SocialPeerPublicEvidenceV1,
  type SocialPeerPublicObservationInputV1
} from "../../src/lib/social-intelligence/social-peer-public-evidence-v1";
import {
  reviewSocialPeerWhitespaceV1,
  type SocialPeerWhitespaceOwnedCoverageV1
} from "../../src/lib/social-intelligence/social-peer-whitespace-review-v1";

const startAt = "2026-09-04T00:00:00Z";
const endAt = "2026-09-18T00:00:00Z";
const asOf = "2026-09-18T08:00:00Z";
const evaluatedAt = "2026-09-18T09:00:00Z";

function peerObservation(
  peerId: string,
  peerDisplayName: string,
  contentId: string,
  overrides: Partial<SocialPeerPublicObservationInputV1> = {}
): SocialPeerPublicObservationInputV1 {
  return {
    observationId: `${peerId}:${contentId}`,
    peerId,
    peerDisplayName,
    platform: "INSTAGRAM",
    sourceKind: "PUBLIC_PLATFORM_PAGE",
    sourceRef: `public:${peerId}:${contentId}`,
    observedAt: "2026-09-10T12:00:00Z",
    capturedAt: "2026-09-18T07:00:00Z",
    contentId,
    format: "process reel",
    hookText: "close-up reveal",
    evidenceRefs: [`evidence:${peerId}:${contentId}`],
    ...overrides
  };
}

function peerEvidence(): SocialPeerPublicEvidenceV1 {
  return compileSocialPeerPublicEvidenceV1({
    asOf,
    observations: [
      peerObservation("peer-a", "Peer A", "a-1", { observedAt: "2026-09-06T12:00:00Z" }),
      peerObservation("peer-a", "Peer A", "a-2", { observedAt: "2026-09-12T12:00:00Z" }),
      peerObservation("peer-b", "Peer B", "b-1", { observedAt: "2026-09-07T12:00:00Z" }),
      peerObservation("peer-b", "Peer B", "b-2", { observedAt: "2026-09-14T12:00:00Z" })
    ],
    coverageWindows: [
      {
        peerId: "peer-a",
        platform: "INSTAGRAM",
        startAt,
        endAt,
        coverage: "COMPLETE_PUBLIC_TIMELINE",
        evidenceRefs: ["coverage:peer-a"]
      },
      {
        peerId: "peer-b",
        platform: "INSTAGRAM",
        startAt,
        endAt,
        coverage: "COMPLETE_PUBLIC_TIMELINE",
        evidenceRefs: ["coverage:peer-b"]
      }
    ]
  });
}

function ownedSnapshot(content: readonly SocialContentInputV1[]): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-owned",
      handle: "keeganhall",
      retrievedAt: asOf,
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: "2026-09-18T07:30:00Z",
        metricCoverage: ["CONTENT_COUNT"],
        limitations: []
      },
      periods: [],
      content
    },
    asOf
  );
}

function coverage(snapshot: CanonicalSocialAccountSnapshotV1): SocialPeerWhitespaceOwnedCoverageV1 {
  return {
    platform: snapshot.platform,
    snapshotId: snapshot.snapshotId,
    startAt,
    endAt,
    coverage: "COMPLETE_CANONICAL_CONTENT_TIMELINE",
    evidenceRefs: ["owned:complete-window"]
  };
}

const policy = {
  maxEvidenceAgeHours: 24,
  minDistinctPeers: 2,
  minDistinctContentPerPeer: 2
} as const;

test("surfaces only bounded peer whitespace from exact complete comparable windows", () => {
  const owned = ownedSnapshot([
    {
      contentId: "own-1",
      publishedAt: "2026-09-10T12:00:00Z",
      format: "carousel",
      hook: "studio reveal"
    }
  ]);

  const result = reviewSocialPeerWhitespaceV1({
    peerEvidence: peerEvidence(),
    ownedSnapshots: [owned],
    ownedCoverage: [coverage(owned)],
    policy,
    evaluatedAt
  });

  assert.equal(result.status, "READY_FOR_RESEARCH");
  assert.deepEqual(result.evaluatedPlatforms, ["INSTAGRAM"]);
  assert.equal(result.candidates.length, 2);

  const format = result.candidates.find((candidate) => candidate.dimension === "FORMAT");
  assert.ok(format);
  assert.equal(format.value, "process reel");
  assert.equal(format.peerCount, 2);
  assert.deepEqual(format.peerIds, ["peer-a", "peer-b"]);
  assert.equal(format.peerDistinctContentCount, 4);
  assert.equal(format.ownedObservedContentCount, 0);
  assert.equal(format.researchCandidate, true);
  assert.equal(format.performanceClaim, false);
  assert.equal(format.audienceGrowthClaim, false);
  assert.equal(format.causalClaim, false);
  assert.equal(format.relationshipClaim, false);
  assert.equal(format.endorsementClaim, false);
  assert.equal(format.attributionClaim, false);
  assert.equal(format.recommendationClaim, false);
  assert.equal(format.confidence, null);
  assert.equal(format.monetaryValue, null);
  assert.match(format.statement, /bounded research whitespace only, not a performance or recommendation claim/i);
  assert.equal(result.providerAccessAuthority, "NONE");
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candidates), true);
});

test("does not call an exact pattern whitespace when owned content contains it in the same complete window", () => {
  const owned = ownedSnapshot([
    {
      contentId: "own-1",
      publishedAt: "2026-09-10T12:00:00Z",
      format: "PROCESS REEL",
      hook: "Close-Up Reveal"
    }
  ]);

  const result = reviewSocialPeerWhitespaceV1({
    peerEvidence: peerEvidence(),
    ownedSnapshots: [owned],
    ownedCoverage: [coverage(owned)],
    policy,
    evaluatedAt
  });

  assert.equal(result.status, "NO_BOUNDED_WHITESPACE");
  assert.deepEqual(result.candidates, []);
});

test("requires complete owned-content coverage before absence can become a whitespace candidate", () => {
  const owned = ownedSnapshot([
    {
      contentId: "own-1",
      publishedAt: "2026-09-10T12:00:00Z",
      format: "carousel"
    }
  ]);
  const partialCoverage = {
    ...coverage(owned),
    coverage: "PARTIAL" as const
  };

  const result = reviewSocialPeerWhitespaceV1({
    peerEvidence: peerEvidence(),
    ownedSnapshots: [owned],
    ownedCoverage: [partialCoverage],
    policy,
    evaluatedAt
  });

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.excludedScopes, [
    { platform: "INSTAGRAM", reason: "OWNED_COVERAGE_NOT_COMPLETE" }
  ]);
});

test("requires enough peers with an exact complete public timeline for the comparison window", () => {
  const peers = compileSocialPeerPublicEvidenceV1({
    asOf,
    observations: [
      peerObservation("peer-a", "Peer A", "a-1"),
      peerObservation("peer-a", "Peer A", "a-2"),
      peerObservation("peer-b", "Peer B", "b-1"),
      peerObservation("peer-b", "Peer B", "b-2")
    ],
    coverageWindows: [
      {
        peerId: "peer-a",
        platform: "INSTAGRAM",
        startAt,
        endAt,
        coverage: "COMPLETE_PUBLIC_TIMELINE",
        evidenceRefs: ["coverage:peer-a"]
      },
      {
        peerId: "peer-b",
        platform: "INSTAGRAM",
        startAt,
        endAt,
        coverage: "PARTIAL",
        evidenceRefs: ["coverage:peer-b-partial"]
      }
    ]
  });
  const owned = ownedSnapshot([
    {
      contentId: "own-1",
      publishedAt: "2026-09-10T12:00:00Z",
      format: "carousel"
    }
  ]);

  const result = reviewSocialPeerWhitespaceV1({
    peerEvidence: peers,
    ownedSnapshots: [owned],
    ownedCoverage: [coverage(owned)],
    policy,
    evaluatedAt
  });

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.excludedScopes, [
    { platform: "INSTAGRAM", reason: "PEER_COMPLETE_WINDOW_NOT_AVAILABLE" }
  ]);
});

test("fails closed when otherwise READY peer evidence is too old for the caller freshness policy", () => {
  const owned = ownedSnapshot([]);
  const result = reviewSocialPeerWhitespaceV1({
    peerEvidence: peerEvidence(),
    ownedSnapshots: [owned],
    ownedCoverage: [coverage(owned)],
    policy: { ...policy, maxEvidenceAgeHours: 0.5 },
    evaluatedAt
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.deepEqual(result.verificationReasons, ["PEER_EVIDENCE_STALE"]);
  assert.deepEqual(result.candidates, []);
});

test("keeps whitespace bounded to the explicit window rather than making a universal coverage claim", () => {
  const owned = ownedSnapshot([
    {
      contentId: "old-process-reel",
      publishedAt: "2026-08-15T12:00:00Z",
      format: "process reel",
      hook: "close-up reveal"
    },
    {
      contentId: "own-in-window",
      publishedAt: "2026-09-10T12:00:00Z",
      format: "carousel",
      hook: "studio reveal"
    }
  ]);

  const result = reviewSocialPeerWhitespaceV1({
    peerEvidence: peerEvidence(),
    ownedSnapshots: [owned],
    ownedCoverage: [coverage(owned)],
    policy,
    evaluatedAt
  });

  assert.equal(result.status, "READY_FOR_RESEARCH");
  assert.ok(result.candidates.some((candidate) => candidate.dimension === "FORMAT" && candidate.value === "process reel"));
  assert.ok(result.candidates.every((candidate) => candidate.windowStartAt === startAt && candidate.windowEndAt === endAt));
  assert.match(result.guardrails.join(" "), /bounded observation gap is not competitor performance/i);
});

test("rejects credential-like provenance and authority widening instead of trusting it", () => {
  const owned = ownedSnapshot([]);
  const unsafeCoverage = {
    ...coverage(owned),
    evidenceRefs: ["Authorization: Bearer secret-token"]
  };
  assert.throws(
    () => reviewSocialPeerWhitespaceV1({
      peerEvidence: peerEvidence(),
      ownedSnapshots: [owned],
      ownedCoverage: [unsafeCoverage],
      policy,
      evaluatedAt
    }),
    /credential-like material/i
  );

  const widenedPeer = {
    ...peerEvidence(),
    writesPerformed: true
  } as unknown as SocialPeerPublicEvidenceV1;
  assert.throws(
    () => reviewSocialPeerWhitespaceV1({
      peerEvidence: widenedPeer,
      ownedSnapshots: [owned],
      ownedCoverage: [coverage(owned)],
      policy,
      evaluatedAt
    }),
    /widens upstream authority/i
  );
});
