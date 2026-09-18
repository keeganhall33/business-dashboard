import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialPlatformV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialSyncRunAcceptanceV1,
  type SocialSyncRunAcceptanceInputV1
} from "../../src/lib/social-intelligence/social-sync-acceptance-v1";

const startedAt = "2026-09-18T07:00:00Z";
const retrievedAt = "2026-09-18T07:04:00Z";
const completedAt = "2026-09-18T07:05:00Z";

function snapshot(
  platform: SocialPlatformV1 = "INSTAGRAM",
  requestedState: "CONNECTED_AND_INGESTING" | "CONNECTED_PARTIAL" = "CONNECTED_AND_INGESTING"
): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform,
      accountId: "keegan-hall",
      retrievedAt,
      sourceCoverage: {
        requestedState,
        lastSuccessfulSyncAt: retrievedAt,
        metricCoverage: ["AUDIENCE_TOTAL", "REACH"]
      },
      periods: [
        {
          periodId: `${platform.toLowerCase()}-7d-current`,
          window: "7D",
          startAt: "2026-09-11T00:00:00Z",
          endAt: "2026-09-18T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_500, evidenceRefs: [`provider:${platform}:audience`] },
            REACH: { value: 41_250, evidenceRefs: [`provider:${platform}:reach`] }
          }
        }
      ]
    },
    retrievedAt
  );
}

function baseInput(): SocialSyncRunAcceptanceInputV1 {
  return {
    platform: "INSTAGRAM",
    connectorId: "meta-graph-instagram",
    runId: "sync:ig:2026-09-18T07:00Z",
    mode: "INCREMENTAL",
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    startedAt,
    completedAt,
    outcome: "SUCCESS",
    hasMore: false,
    providerEvidenceRefs: ["provider-request:ig:run-1"],
    pages: [
      {
        pageId: "page-1",
        fetchedAt: "2026-09-18T07:02:00Z",
        recordCount: 25,
        providerEvidenceRefs: ["provider-response:ig:page-1", "provider-request:ig:run-1"]
      }
    ],
    snapshot: snapshot()
  };
}

test("accepts a complete authorized read-only run and advances the completed checkpoint", () => {
  const result = compileSocialSyncRunAcceptanceV1(baseInput());

  assert.equal(result.acceptedForLiveProof, true);
  assert.equal(result.proof?.liveFirstPartyData, true);
  assert.equal(result.proof?.syncOutcome, "SUCCESS");
  assert.equal(result.proof?.snapshot.platform, "INSTAGRAM");
  assert.deepEqual(result.providerEvidenceRefs, [
    "provider-request:ig:run-1",
    "provider-response:ig:page-1"
  ]);
  assert.equal(result.retryRequired, false);
  assert.equal(result.checkpointAction, "ADVANCE_COMPLETED");
  assert.deepEqual(result.nextCheckpoint, {
    cursor: null,
    completedThroughAt: retrievedAt
  });
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.nextCheckpoint), true);
});

test("preserves a rate-limited partial run as live-partial evidence and saves only the resume cursor", () => {
  const input = baseInput();
  const result = compileSocialSyncRunAcceptanceV1({
    ...input,
    outcome: "RATE_LIMITED",
    hasMore: true,
    resumeCursor: "cursor:next",
    limitations: ["Provider rate limit interrupted content pagination"],
    priorCheckpoint: {
      cursor: "cursor:prior",
      completedThroughAt: "2026-09-17T07:00:00Z"
    },
    pages: [
      {
        pageId: "page-partial",
        fetchedAt: "2026-09-18T07:02:00Z",
        cursorIn: "cursor:prior",
        cursorOut: "cursor:next",
        recordCount: 10,
        providerEvidenceRefs: ["provider-response:ig:partial"]
      }
    ],
    snapshot: snapshot("INSTAGRAM", "CONNECTED_PARTIAL")
  });

  assert.equal(result.acceptedForLiveProof, true);
  assert.equal(result.proof?.syncOutcome, "PARTIAL");
  assert.equal(result.retryRequired, true);
  assert.equal(result.checkpointAction, "SAVE_RESUME");
  assert.deepEqual(result.nextCheckpoint, {
    cursor: "cursor:next",
    completedThroughAt: "2026-09-17T07:00:00.000Z"
  });
  assert.match(result.limitations[0] ?? "", /rate limit/i);
});

test("failed runs cannot emit live proof or advance durable progress", () => {
  const input = baseInput();
  const result = compileSocialSyncRunAcceptanceV1({
    ...input,
    outcome: "FAILED",
    hasMore: true,
    snapshot: null,
    priorCheckpoint: {
      cursor: "cursor:resume-existing",
      completedThroughAt: "2026-09-17T07:00:00Z"
    }
  });

  assert.equal(result.acceptedForLiveProof, false);
  assert.equal(result.proof, null);
  assert.equal(result.retryRequired, true);
  assert.equal(result.checkpointAction, "HOLD");
  assert.deepEqual(result.nextCheckpoint, {
    cursor: "cursor:resume-existing",
    completedThroughAt: "2026-09-17T07:00:00.000Z"
  });
});

test("fails closed on success claims that still have remaining pagination", () => {
  assert.throws(
    () => compileSocialSyncRunAcceptanceV1({ ...baseInput(), hasMore: true, resumeCursor: "cursor:next" }),
    /successful sync cannot claim remaining pages/i
  );
});

test("requires resume continuity for incremental sync checkpoints", () => {
  assert.throws(
    () =>
      compileSocialSyncRunAcceptanceV1({
        ...baseInput(),
        priorCheckpoint: { cursor: "cursor:expected", completedThroughAt: null },
        pages: [
          {
            pageId: "page-1",
            fetchedAt: "2026-09-18T07:02:00Z",
            cursorIn: "cursor:other",
            recordCount: 5,
            providerEvidenceRefs: ["provider-response:ig:page-1"]
          }
        ]
      }),
    /resume from the prior checkpoint cursor/i
  );
});

test("rejects snapshot identity mismatch and unsupported live evidence", () => {
  assert.throws(
    () => compileSocialSyncRunAcceptanceV1({ ...baseInput(), snapshot: snapshot("YOUTUBE") }),
    /snapshot platform mismatch/i
  );

  const emptyEvidenceSnapshot = compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      retrievedAt,
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: retrievedAt,
        metricCoverage: []
      },
      periods: [
        {
          periodId: "ig-empty",
          window: "7D",
          startAt: "2026-09-11T00:00:00Z",
          endAt: "2026-09-18T00:00:00Z"
        }
      ]
    },
    retrievedAt
  );

  assert.throws(
    () => compileSocialSyncRunAcceptanceV1({ ...baseInput(), snapshot: emptyEvidenceSnapshot }),
    /canonical metric\/content evidence/i
  );
});

test("rejects duplicate pages, out-of-run receipts, and credential material", () => {
  const page = baseInput().pages[0];
  assert.throws(
    () => compileSocialSyncRunAcceptanceV1({ ...baseInput(), pages: [page, page] }),
    /duplicate pageId/i
  );

  assert.throws(
    () =>
      compileSocialSyncRunAcceptanceV1({
        ...baseInput(),
        pages: [{ ...page, pageId: "late-page", fetchedAt: "2026-09-18T08:00:00Z" }]
      }),
    /fetchedAt must fall within the sync run/i
  );

  assert.throws(
    () =>
      compileSocialSyncRunAcceptanceV1({
        ...baseInput(),
        accessToken: "must-not-enter-contract"
      } as SocialSyncRunAcceptanceInputV1),
    /credential material/i
  );
});

test("successful sync cannot move a completed checkpoint backwards", () => {
  assert.throws(
    () =>
      compileSocialSyncRunAcceptanceV1({
        ...baseInput(),
        priorCheckpoint: {
          cursor: null,
          completedThroughAt: "2026-09-19T07:00:00Z"
        }
      }),
    /cannot move the completed checkpoint backwards/i
  );
});
