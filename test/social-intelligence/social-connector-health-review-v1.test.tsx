import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialPlatformV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import type { SocialPlatformConnectorInputV1 } from "../../src/lib/social-intelligence/social-connector-proof-v1";
import { compileSocialConnectorHealthReviewV1 } from "../../src/lib/social-intelligence/social-connector-health-review-v1";
import type { SocialLiveProviderRunInputV1 } from "../../src/lib/social-intelligence/social-live-provider-run-v1";

const now = "2026-09-19T03:30:00Z";

function instagramSnapshot(retrievedAt = "2026-09-19T03:20:00Z"): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      handle: "@keeganhall",
      retrievedAt,
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: retrievedAt,
        metricCoverage: ["AUDIENCE_TOTAL", "REACH", "VIEWS"],
        limitations: ["Historical depth is provider bounded"]
      },
      periods: [
        {
          periodId: `ig-7d-${retrievedAt}`,
          window: "7D",
          startAt: "2026-09-12T00:00:00Z",
          endAt: "2026-09-19T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_500, evidenceRefs: ["provider:instagram:audience:2026-09-19"] },
            REACH: { value: 41_250, evidenceRefs: ["provider:instagram:reach:2026-09-19"] },
            VIEWS: { value: 76_000, evidenceRefs: ["provider:instagram:views:2026-09-19"] }
          }
        }
      ]
    },
    retrievedAt
  );
}

function platformInput(platform: SocialPlatformV1): SocialPlatformConnectorInputV1 {
  switch (platform) {
    case "INSTAGRAM": {
      const snapshot = instagramSnapshot();
      return {
        platform,
        connectorId: "meta-graph-instagram",
        availability: "AVAILABLE",
        authorizationState: "AUTHORIZED",
        implementationState: "IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        supportedMetrics: ["AUDIENCE_TOTAL", "REACH", "VIEWS"],
        historicalBackfill: "LIMITED",
        limitations: ["Historical depth is provider bounded"],
        proof: {
          liveFirstPartyData: true,
          syncOutcome: "SUCCESS",
          retrievedAt: snapshot.retrievedAt,
          providerEvidenceRefs: ["provider-request:meta:ig:request-123"],
          snapshot
        }
      };
    }
    case "FACEBOOK":
      return {
        platform,
        connectorId: "meta-graph-facebook",
        availability: "AVAILABLE",
        authorizationState: "AUTHORIZED",
        implementationState: "IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        supportedMetrics: ["REACH", "VIEWS"],
        historicalBackfill: "LIMITED",
        limitations: ["Authorized but canonical live proof is not yet supplied"]
      };
    case "YOUTUBE":
      return {
        platform,
        connectorId: "youtube-analytics",
        availability: "AVAILABLE",
        authorizationState: "AUTHORIZED",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        supportedMetrics: ["AUDIENCE_TOTAL", "VIEWS", "WATCH_TIME_SECONDS"],
        historicalBackfill: "SUPPORTED"
      };
    case "TIKTOK":
      return {
        platform,
        connectorId: "tiktok-authorized",
        availability: "AVAILABLE",
        authorizationState: "NEEDS_KEEGAN_CONNECTION",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: "OFFICIAL_API",
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["Account authorization is not yet proven"]
      };
    case "X":
      return {
        platform,
        connectorId: "x-read-api",
        availability: "UNAVAILABLE",
        authorizationState: "NOT_APPLICABLE",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: null,
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["No authorized source is configured"]
      };
    case "THREADS":
      return {
        platform,
        connectorId: "threads-api",
        availability: "UNAVAILABLE",
        authorizationState: "NOT_APPLICABLE",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: null,
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["Availability has not been established"]
      };
    case "LINKEDIN":
      return {
        platform,
        connectorId: "linkedin-authorized",
        availability: "NOT_RECOMMENDED",
        authorizationState: "NOT_APPLICABLE",
        implementationState: "NOT_IMPLEMENTED",
        sourceKind: null,
        readOnly: true,
        historicalBackfill: "UNKNOWN",
        limitations: ["No decision-useful authorized connector has been selected"]
      };
  }
}

function connectorInputs(): SocialPlatformConnectorInputV1[] {
  return (["INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "X", "THREADS", "LINKEDIN"] as SocialPlatformV1[]).map(platformInput);
}

function instagramRun(overrides: Partial<SocialLiveProviderRunInputV1> = {}): SocialLiveProviderRunInputV1 {
  return {
    platform: "INSTAGRAM",
    connectorId: "meta-graph-instagram",
    runId: "ig-run-123",
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    externalAccessPerformed: true,
    writesPerformed: false,
    startedAt: "2026-09-19T03:19:00Z",
    retrievedAt: "2026-09-19T03:20:00Z",
    previousSuccessfulSyncAt: "2026-09-18T03:20:00Z",
    requestedMetricKeys: ["AUDIENCE_TOTAL", "REACH", "VIEWS"],
    requestedWindows: ["7D"],
    pages: [
      {
        pageIndex: 0,
        capturedAt: "2026-09-19T03:19:30Z",
        itemCount: 3,
        evidenceRefs: ["provider-request:meta:ig:request-123"]
      }
    ],
    runState: "COMPLETE",
    paginationExhausted: true,
    limitations: ["Historical depth is provider bounded"],
    ...overrides
  };
}

test("projects explicit source health without upgrading unproven connectors to live", () => {
  const result = compileSocialConnectorHealthReviewV1(connectorInputs(), [instagramRun()], now);

  assert.deepEqual(result.healthyPlatforms, ["INSTAGRAM"]);
  assert.deepEqual(result.blockedPlatforms, ["YOUTUBE", "TIKTOK"]);
  assert.deepEqual(result.platformsNeedingKeeganAction, ["TIKTOK"]);
  assert.deepEqual(result.liveFirstPartyPlatforms, ["INSTAGRAM"]);

  const instagram = result.platforms.find((row) => row.platform === "INSTAGRAM")!;
  assert.equal(instagram.sourceHealth, "HEALTHY");
  assert.equal(instagram.canonicalDataState, "CURRENT");
  assert.equal(instagram.liveFirstPartyDataProven, true);
  assert.equal(instagram.latestProviderRunState, "COMPLETE");

  const facebook = result.platforms.find((row) => row.platform === "FACEBOOK")!;
  assert.equal(facebook.sourceHealth, "UNPROVEN");
  assert.equal(facebook.canonicalDataState, "UNPROVEN");
  assert.equal(facebook.liveFirstPartyDataProven, false);
  assert.deepEqual(facebook.issues, ["CANONICAL_PROOF_MISSING"]);
});

test("surfaces a newer failed provider run as degraded while preserving the last proven canonical data state", () => {
  const failed = instagramRun({
    runId: "ig-run-failed",
    startedAt: "2026-09-19T03:24:00Z",
    retrievedAt: "2026-09-19T03:25:00Z",
    pages: [],
    runState: "FAILED",
    paginationExhausted: false,
    interruptionReason: "PROVIDER_ERROR",
    limitations: ["Provider returned an upstream error"]
  });

  const result = compileSocialConnectorHealthReviewV1(connectorInputs(), [failed], now);
  const instagram = result.platforms.find((row) => row.platform === "INSTAGRAM")!;

  assert.equal(instagram.sourceHealth, "DEGRADED");
  assert.equal(instagram.canonicalDataState, "CURRENT");
  assert.equal(instagram.liveFirstPartyDataProven, true);
  assert.deepEqual(instagram.issues, ["LATEST_PROVIDER_RUN_FAILED"]);
  assert.match(instagram.limitations.join(" "), /upstream error/i);
  assert.deepEqual(result.degradedPlatforms, ["INSTAGRAM"]);
});

test("surfaces a newer partial provider run and keeps retry timing explicit", () => {
  const partial = instagramRun({
    runId: "ig-run-partial",
    startedAt: "2026-09-19T03:24:00Z",
    retrievedAt: "2026-09-19T03:25:00Z",
    pages: [
      {
        pageIndex: 0,
        capturedAt: "2026-09-19T03:24:30Z",
        itemCount: 2,
        evidenceRefs: ["provider-request:meta:ig:partial"]
      }
    ],
    runState: "PARTIAL",
    paginationExhausted: false,
    interruptionReason: "RATE_LIMIT",
    retryAfterAt: "2026-09-19T04:00:00Z",
    limitations: ["Provider rate limit interrupted pagination"]
  });

  const result = compileSocialConnectorHealthReviewV1(connectorInputs(), [partial], now);
  const instagram = result.platforms.find((row) => row.platform === "INSTAGRAM")!;

  assert.equal(instagram.sourceHealth, "DEGRADED");
  assert.deepEqual(instagram.issues, ["LATEST_PROVIDER_RUN_PARTIAL"]);
  assert.equal(instagram.retryAfterAt, "2026-09-19T04:00:00.000Z");
  assert.equal(instagram.needsEngineeringAction, true);
});

test("flags canonical proof lag when a newer complete provider run has not entered canonical state yet", () => {
  const newerComplete = instagramRun({
    runId: "ig-run-newer",
    startedAt: "2026-09-19T03:24:00Z",
    retrievedAt: "2026-09-19T03:25:00Z",
    pages: [
      {
        pageIndex: 0,
        capturedAt: "2026-09-19T03:24:30Z",
        itemCount: 3,
        evidenceRefs: ["provider-request:meta:ig:newer"]
      }
    ]
  });

  const result = compileSocialConnectorHealthReviewV1(connectorInputs(), [newerComplete], now);
  const instagram = result.platforms.find((row) => row.platform === "INSTAGRAM")!;

  assert.equal(instagram.sourceHealth, "DEGRADED");
  assert.equal(instagram.canonicalDataState, "CURRENT");
  assert.deepEqual(instagram.issues, ["CANONICAL_PROOF_LAGGING"]);
  assert.equal(instagram.needsEngineeringAction, true);
});

test("does not let a provider run masquerade as canonical live proof", () => {
  const facebookRun: SocialLiveProviderRunInputV1 = {
    ...instagramRun(),
    platform: "FACEBOOK",
    connectorId: "meta-graph-facebook",
    runId: "fb-run-1",
    requestedMetricKeys: ["REACH", "VIEWS"]
  };

  const result = compileSocialConnectorHealthReviewV1(connectorInputs(), [facebookRun], now);
  const facebook = result.platforms.find((row) => row.platform === "FACEBOOK")!;

  assert.equal(facebook.sourceHealth, "UNPROVEN");
  assert.equal(facebook.liveFirstPartyDataProven, false);
  assert.deepEqual(facebook.issues, ["CANONICAL_PROOF_MISSING"]);
});

test("fails closed when provider runs do not bind to the canonical connector identity", () => {
  const wrongConnector = instagramRun({ connectorId: "different-instagram-connector" });
  assert.throws(
    () => compileSocialConnectorHealthReviewV1(connectorInputs(), [wrongConnector], now),
    /connectorId does not match the canonical connector registry/i
  );

  const wrongSource = instagramRun({ sourceKind: "AUTHORIZED_EXPORT" });
  assert.throws(
    () => compileSocialConnectorHealthReviewV1(connectorInputs(), [wrongSource], now),
    /sourceKind does not match the canonical connector registry/i
  );
});

test("rejects provider runs for connectors that are not authorized and implemented", () => {
  const youtubeRun: SocialLiveProviderRunInputV1 = {
    ...instagramRun(),
    platform: "YOUTUBE",
    connectorId: "youtube-analytics",
    runId: "youtube-run-1",
    requestedMetricKeys: ["AUDIENCE_TOTAL", "VIEWS", "WATCH_TIME_SECONDS"]
  };

  assert.throws(
    () => compileSocialConnectorHealthReviewV1(connectorInputs(), [youtubeRun], now),
    /not authorized and implemented/i
  );
});

test("inherits stale canonical proof semantics instead of relabeling old data as healthy", () => {
  const inputs = connectorInputs();
  const staleSnapshot = instagramSnapshot("2026-09-15T03:20:00Z");
  inputs[0] = {
    ...inputs[0],
    proof: {
      liveFirstPartyData: true,
      syncOutcome: "SUCCESS",
      retrievedAt: staleSnapshot.retrievedAt,
      providerEvidenceRefs: ["provider-request:meta:ig:stale"],
      snapshot: staleSnapshot
    }
  };

  const result = compileSocialConnectorHealthReviewV1(inputs, [], now, 48);
  const instagram = result.platforms.find((row) => row.platform === "INSTAGRAM")!;
  assert.equal(instagram.sourceHealth, "STALE");
  assert.equal(instagram.canonicalDataState, "STALE");
  assert.deepEqual(instagram.issues, ["CANONICAL_PROOF_STALE"]);
});

test("is deterministic, immutable, zero-write, and does not mutate caller input", () => {
  const connectors = connectorInputs();
  const runs = [instagramRun()];
  const connectorsBefore = JSON.stringify(connectors);
  const runsBefore = JSON.stringify(runs);

  const first = compileSocialConnectorHealthReviewV1(connectors, runs, now);
  const second = compileSocialConnectorHealthReviewV1(connectorInputs(), [instagramRun()], now);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(connectors), connectorsBefore);
  assert.equal(JSON.stringify(runs), runsBefore);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.platforms), true);
  assert.equal(Object.isFrozen(first.platforms[0]), true);
  assert.equal(first.externalAccessPerformed, false);
  assert.equal(first.writesPerformed, false);
});
