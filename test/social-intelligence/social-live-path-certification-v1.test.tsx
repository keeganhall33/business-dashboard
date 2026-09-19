import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialPlatformV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import { compileSocialChannelDrilldownV1 } from "../../src/lib/social-intelligence/social-channel-drilldown-v1";
import { compileSocialConnectorHealthReviewV1 } from "../../src/lib/social-intelligence/social-connector-health-review-v1";
import type { SocialPlatformConnectorInputV1 } from "../../src/lib/social-intelligence/social-connector-proof-v1";
import {
  compileSocialLivePathCertificationV1
} from "../../src/lib/social-intelligence/social-live-path-certification-v1";
import type { SocialLiveProviderRunInputV1 } from "../../src/lib/social-intelligence/social-live-provider-run-v1";
import { compileSocialSnapshotHistoryLedgerV1 } from "../../src/lib/social-intelligence/social-snapshot-history-ledger-v1";
import { compileSocialSyncRunAcceptanceV1 } from "../../src/lib/social-intelligence/social-sync-acceptance-v1";

const now = "2026-09-19T05:00:00Z";
const retrievedAt = "2026-09-19T04:55:00Z";
const runId = "ig-run-live-001";
const connectorId = "meta-graph-instagram";
const providerEvidenceRef = "provider-request:meta:ig:live-001";

function instagramSnapshot(at = retrievedAt): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      handle: "@keeganhall",
      retrievedAt: at,
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: at,
        metricCoverage: ["AUDIENCE_TOTAL", "REACH", "VIEWS"],
        limitations: ["Historical depth is provider bounded"]
      },
      periods: [
        {
          periodId: `ig-7d-${at}`,
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
    at
  );
}

function connectorInput(platform: SocialPlatformV1, snapshot: CanonicalSocialAccountSnapshotV1): SocialPlatformConnectorInputV1 {
  if (platform === "INSTAGRAM") {
    return {
      platform,
      connectorId,
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
        providerEvidenceRefs: [providerEvidenceRef],
        snapshot
      }
    };
  }

  if (platform === "FACEBOOK") {
    return {
      platform,
      connectorId: "meta-graph-facebook",
      availability: "AVAILABLE",
      authorizationState: "AUTHORIZED",
      implementationState: "NOT_IMPLEMENTED",
      sourceKind: "OFFICIAL_API",
      readOnly: true,
      historicalBackfill: "LIMITED"
    };
  }

  if (platform === "YOUTUBE") {
    return {
      platform,
      connectorId: "youtube-analytics",
      availability: "AVAILABLE",
      authorizationState: "AUTHORIZED",
      implementationState: "NOT_IMPLEMENTED",
      sourceKind: "OFFICIAL_API",
      readOnly: true,
      historicalBackfill: "SUPPORTED"
    };
  }

  if (platform === "TIKTOK") {
    return {
      platform,
      connectorId: "tiktok-authorized",
      availability: "AVAILABLE",
      authorizationState: "NEEDS_KEEGAN_CONNECTION",
      implementationState: "NOT_IMPLEMENTED",
      sourceKind: "OFFICIAL_API",
      readOnly: true,
      historicalBackfill: "UNKNOWN"
    };
  }

  return {
    platform,
    connectorId: `${platform.toLowerCase()}-unavailable`,
    availability: platform === "LINKEDIN" ? "NOT_RECOMMENDED" : "UNAVAILABLE",
    authorizationState: "NOT_APPLICABLE",
    implementationState: "NOT_IMPLEMENTED",
    sourceKind: null,
    readOnly: true,
    historicalBackfill: "UNKNOWN"
  };
}

function connectorInputs(snapshot: CanonicalSocialAccountSnapshotV1): SocialPlatformConnectorInputV1[] {
  return (["INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "X", "THREADS", "LINKEDIN"] as SocialPlatformV1[]).map((platform) =>
    connectorInput(platform, snapshot)
  );
}

function providerRun(overrides: Partial<SocialLiveProviderRunInputV1> = {}): SocialLiveProviderRunInputV1 {
  return {
    platform: "INSTAGRAM",
    connectorId,
    runId,
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    externalAccessPerformed: true,
    writesPerformed: false,
    startedAt: "2026-09-19T04:54:00Z",
    retrievedAt,
    previousSuccessfulSyncAt: "2026-09-18T04:55:00Z",
    requestedMetricKeys: ["AUDIENCE_TOTAL", "REACH", "VIEWS"],
    requestedWindows: ["7D"],
    pages: [
      {
        pageIndex: 0,
        capturedAt: "2026-09-19T04:54:30Z",
        itemCount: 3,
        evidenceRefs: [providerEvidenceRef]
      }
    ],
    runState: "COMPLETE",
    paginationExhausted: true,
    limitations: ["Historical depth is provider bounded"],
    ...overrides
  };
}

function successfulSync(snapshot: CanonicalSocialAccountSnapshotV1) {
  return compileSocialSyncRunAcceptanceV1({
    platform: "INSTAGRAM",
    connectorId,
    runId,
    mode: "INCREMENTAL",
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    startedAt: "2026-09-19T04:54:00Z",
    completedAt: retrievedAt,
    outcome: "SUCCESS",
    hasMore: false,
    providerEvidenceRefs: [providerEvidenceRef],
    pages: [
      {
        pageId: "ig-page-1",
        fetchedAt: "2026-09-19T04:54:30Z",
        recordCount: 3,
        providerEvidenceRefs: [providerEvidenceRef]
      }
    ],
    snapshot
  });
}

function fullInputs() {
  const snapshot = instagramSnapshot();
  const sync = successfulSync(snapshot);
  const health = compileSocialConnectorHealthReviewV1(connectorInputs(snapshot), [providerRun()], now);
  const history = compileSocialSnapshotHistoryLedgerV1([snapshot], now);
  const drilldown = compileSocialChannelDrilldownV1(snapshot, { window: "7D", now });
  return { snapshot, sync, health, history, drilldown };
}

test("certifies one exact live provider-to-canonical-to-history-to-drilldown path", () => {
  const { sync, health, history, drilldown } = fullInputs();
  const result = compileSocialLivePathCertificationV1(sync, health, history, drilldown, { now });

  assert.equal(result.state, "CERTIFIED");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.providerToCanonicalProven, true);
  assert.equal(result.canonicalHistoryProven, true);
  assert.equal(result.userVisibleDrilldownProven, true);
  assert.equal(result.sourceFresh, true);
  assert.deepEqual(result.decisionGradeMetricKeys, ["AUDIENCE_TOTAL", "REACH", "VIEWS"]);
  assert.equal(result.causalClaimsCreated, false);
  assert.equal(result.attributionClaimsCreated, false);
  assert.equal(result.externalActionAuthorityGranted, false);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("withholds certification when the accepted canonical snapshot is not present in history", () => {
  const { sync, health, history, drilldown } = fullInputs();
  const missingHistory = { ...history, accounts: [] };
  const result = compileSocialLivePathCertificationV1(sync, health, missingHistory, drilldown, { now });

  assert.equal(result.state, "WITHHELD");
  assert.deepEqual(result.blockers, ["HISTORY_ACCOUNT_MISSING"]);
  assert.equal(result.providerToCanonicalProven, true);
  assert.equal(result.canonicalHistoryProven, false);
  assert.equal(result.userVisibleDrilldownProven, true);
});

test("withholds certification when a newer failed provider run degrades connector health", () => {
  const { snapshot, sync, history, drilldown } = fullInputs();
  const failed = providerRun({
    runId: "ig-run-live-002",
    startedAt: "2026-09-19T04:57:00Z",
    retrievedAt: "2026-09-19T04:58:00Z",
    pages: [],
    runState: "FAILED",
    paginationExhausted: false,
    interruptionReason: "PROVIDER_ERROR",
    limitations: ["Provider returned an upstream error"]
  });
  const health = compileSocialConnectorHealthReviewV1(connectorInputs(snapshot), [providerRun(), failed], now);
  const result = compileSocialLivePathCertificationV1(sync, health, history, drilldown, { now });

  assert.equal(result.state, "WITHHELD");
  assert.ok(result.blockers.includes("CONNECTOR_NOT_HEALTHY"));
  assert.ok(result.blockers.includes("HEALTH_RUN_MISMATCH"));
  assert.equal(result.providerToCanonicalProven, false);
});

test("withholds stale proof rather than treating an old live snapshot as current", () => {
  const { sync, health, history, drilldown } = fullInputs();
  const later = "2026-09-22T05:00:00Z";
  const result = compileSocialLivePathCertificationV1(sync, health, history, drilldown, {
    now: later,
    staleAfterHours: 48
  });

  assert.equal(result.state, "WITHHELD");
  assert.ok(result.blockers.includes("PROOF_STALE"));
  assert.ok(result.blockers.includes("CONNECTOR_HEALTH_NOT_CURRENT"));
  assert.ok(result.blockers.includes("HISTORY_NOT_DECISION_READY"));
  assert.equal(result.sourceFresh, false);
});
