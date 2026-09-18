import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialMetricKeyV1,
  type SocialPlatformV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialSnapshotHistoryLedgerV1,
  planSocialHistoryAppendV1
} from "../../src/lib/social-intelligence/social-snapshot-history-ledger-v1";

function makeSnapshot(options: {
  platform?: SocialPlatformV1;
  accountId?: string;
  retrievedAt: string;
  lastSuccessfulSyncAt?: string | null;
  requestedState?: "CONNECTED_AND_INGESTING" | "CONNECTED_PARTIAL";
  metricCoverage?: readonly SocialMetricKeyV1[];
  audienceValue?: number | null;
  audienceEvidenceRefs?: readonly string[];
  reachValue?: number | null;
  reachEvidenceRefs?: readonly string[];
  periodStartAt?: string;
  periodEndAt?: string;
  periodId?: string;
  contentPublishedAt?: string | null;
  contentEvidenceRefs?: readonly string[];
}): CanonicalSocialAccountSnapshotV1 {
  const platform = options.platform ?? "INSTAGRAM";
  const periodStartAt = options.periodStartAt ?? "2026-08-01T00:00:00.000Z";
  const periodEndAt = options.periodEndAt ?? "2026-08-31T23:59:59.000Z";
  const metrics = {
    AUDIENCE_TOTAL: {
      value: options.audienceValue === undefined ? 100 : options.audienceValue,
      evidenceRefs: options.audienceEvidenceRefs ?? ["provider:audience:august"]
    },
    REACH: {
      value: options.reachValue === undefined ? 1_000 : options.reachValue,
      evidenceRefs: options.reachEvidenceRefs ?? ["provider:reach:august"]
    }
  };

  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform,
      accountId: options.accountId ?? "keegan-social",
      handle: platform === "INSTAGRAM" ? "keeganhall" : "KeeganHallArt",
      retrievedAt: options.retrievedAt,
      sourceCoverage: {
        requestedState: options.requestedState ?? "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: options.lastSuccessfulSyncAt === undefined ? options.retrievedAt : options.lastSuccessfulSyncAt,
        metricCoverage: options.metricCoverage ?? ["AUDIENCE_TOTAL", "REACH"],
        limitations: []
      },
      periods: [
        {
          periodId: options.periodId ?? "30d-2026-08",
          window: "30D",
          startAt: periodStartAt,
          endAt: periodEndAt,
          metrics
        }
      ],
      content: options.contentPublishedAt
        ? [
            {
              contentId: "post-1",
              publishedAt: options.contentPublishedAt,
              metrics: {
                REACH: {
                  value: 500,
                  evidenceRefs: options.contentEvidenceRefs ?? ["provider:post-1:reach"]
                }
              }
            }
          ]
        : []
    },
    options.retrievedAt,
    48
  );
}

test("builds append-only metric history without cross-platform aggregation or causal claims", () => {
  const first = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    audienceValue: 100,
    audienceEvidenceRefs: ["provider:audience:august"]
  });
  const second = makeSnapshot({
    retrievedAt: "2026-09-11T12:00:00.000Z",
    audienceValue: 120,
    audienceEvidenceRefs: ["provider:audience:august"]
  });

  const ledger = compileSocialSnapshotHistoryLedgerV1([first, second], "2026-09-11T13:00:00.000Z");

  assert.equal(ledger.snapshotCount, 2);
  assert.equal(ledger.accounts.length, 1);
  assert.equal(ledger.crossPlatformAggregationPerformed, false);
  assert.equal(ledger.causalClaimsCreated, false);
  assert.equal(ledger.attributionClaimsCreated, false);
  assert.equal(ledger.externalAccessPerformed, false);
  assert.equal(ledger.writesPerformed, false);

  const account = ledger.accounts[0];
  assert.equal(account.decisionReady, true);
  assert.equal(account.currentSourceFreshness, "FRESH");
  assert.equal(account.latestSourceState, "CONNECTED_AND_INGESTING");
  const audience = account.metricSeries.find((series) => series.window === "30D" && series.metricKey === "AUDIENCE_TOTAL");
  assert.ok(audience);
  assert.equal(audience.points.length, 2);
  assert.equal(audience.points[0].revisionState, "INITIAL");
  assert.equal(audience.points[1].revisionState, "REVISED_VALUE");
  assert.equal(audience.points[1].previousObservationSnapshotId, first.snapshotId);
  assert.equal(audience.points[1].value, 120);
  assert.equal(audience.points[1].evidenceBacked, true);
});

test("deduplicates exact replayed snapshots instead of inflating history", () => {
  const snapshot = makeSnapshot({ retrievedAt: "2026-09-10T12:00:00.000Z" });
  const ledger = compileSocialSnapshotHistoryLedgerV1([snapshot, snapshot], "2026-09-10T13:00:00.000Z");
  assert.equal(ledger.snapshotCount, 1);
  assert.equal(ledger.accounts[0].snapshotCount, 1);

  const plan = planSocialHistoryAppendV1(snapshot, [snapshot], "2026-09-10T13:00:00.000Z");
  assert.equal(plan.decision, "NOOP_DUPLICATE");
  assert.equal(plan.conflictingSnapshotId, snapshot.snapshotId);
  assert.equal(plan.writesPerformed, false);
});

test("fails closed when one canonical snapshot identity has conflicting payloads", () => {
  const snapshot = makeSnapshot({ retrievedAt: "2026-09-10T12:00:00.000Z" });
  const conflicting = { ...snapshot, handle: "different-handle" } as CanonicalSocialAccountSnapshotV1;

  assert.throws(
    () => compileSocialSnapshotHistoryLedgerV1([snapshot, conflicting], "2026-09-10T13:00:00.000Z"),
    /conflicting payloads share snapshotId/
  );

  const plan = planSocialHistoryAppendV1(conflicting, [snapshot], "2026-09-10T13:00:00.000Z");
  assert.equal(plan.decision, "VERIFY_CONFLICT");
  assert.equal(plan.conflictingSnapshotId, snapshot.snapshotId);
});

test("plans a new valid canonical snapshot for append without performing the write", () => {
  const first = makeSnapshot({ retrievedAt: "2026-09-10T12:00:00.000Z" });
  const second = makeSnapshot({ retrievedAt: "2026-09-11T12:00:00.000Z", audienceValue: 101 });

  const plan = planSocialHistoryAppendV1(second, [first], "2026-09-11T13:00:00.000Z");
  assert.equal(plan.decision, "APPEND");
  assert.equal(plan.snapshotId, second.snapshotId);
  assert.equal(plan.conflictingSnapshotId, null);
  assert.equal(plan.externalAccessPerformed, false);
  assert.equal(plan.writesPerformed, false);
});

test("preserves UNKNOWN history as null instead of coercing it to zero", () => {
  const snapshot = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    audienceValue: null,
    audienceEvidenceRefs: []
  });
  const ledger = compileSocialSnapshotHistoryLedgerV1([snapshot], "2026-09-10T13:00:00.000Z");
  const audience = ledger.accounts[0].metricSeries.find((series) => series.metricKey === "AUDIENCE_TOTAL");
  assert.ok(audience);
  assert.equal(audience.latestPoint?.value, null);
  assert.equal(audience.latestPoint?.truthState, "UNKNOWN");
  assert.equal(audience.latestPoint?.evidenceBacked, false);
});

test("marks the account non-decision-ready when a KNOWN metric lacks provenance", () => {
  const snapshot = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    audienceValue: 100,
    audienceEvidenceRefs: []
  });
  const ledger = compileSocialSnapshotHistoryLedgerV1([snapshot], "2026-09-10T13:00:00.000Z");

  assert.equal(ledger.accounts[0].decisionReady, false);
  assert.ok(ledger.accounts[0].integrityIssues.some((issue) => issue.includes("AUDIENCE_TOTAL is KNOWN without evidence")));
});

test("marks declared provider coverage contradictions as non-decision-ready", () => {
  const snapshot = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    metricCoverage: ["REACH"],
    audienceValue: 100
  });
  const ledger = compileSocialSnapshotHistoryLedgerV1([snapshot], "2026-09-10T13:00:00.000Z");

  assert.equal(ledger.accounts[0].decisionReady, false);
  assert.ok(ledger.accounts[0].integrityIssues.some((issue) => issue.includes("outside declared provider coverage")));
});

test("re-evaluates source freshness at history-read time", () => {
  const snapshot = makeSnapshot({
    retrievedAt: "2026-09-01T12:00:00.000Z",
    lastSuccessfulSyncAt: "2026-09-01T12:00:00.000Z"
  });
  const ledger = compileSocialSnapshotHistoryLedgerV1([snapshot], "2026-09-05T12:00:00.000Z", 48);

  assert.equal(ledger.accounts[0].currentSourceFreshness, "STALE");
  assert.equal(ledger.accounts[0].latestSourceState, "CONNECTED_PARTIAL");
  assert.equal(ledger.accounts[0].decisionReady, false);
});

test("rejects snapshots and observations that occur in the future", () => {
  const futureSnapshot = makeSnapshot({ retrievedAt: "2026-09-12T12:00:00.000Z" });
  assert.throws(
    () => compileSocialSnapshotHistoryLedgerV1([futureSnapshot], "2026-09-11T12:00:00.000Z"),
    /future-dated/
  );

  const futureContent = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    contentPublishedAt: "2026-09-11T12:00:00.000Z"
  });
  assert.throws(
    () => compileSocialSnapshotHistoryLedgerV1([futureContent], "2026-09-10T13:00:00.000Z"),
    /future-dated content/
  );
});

test("rejects a metric period that extends beyond snapshot retrieval", () => {
  const snapshot = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    periodStartAt: "2026-09-01T00:00:00.000Z",
    periodEndAt: "2026-09-11T00:00:00.000Z"
  });

  assert.throws(
    () => compileSocialSnapshotHistoryLedgerV1([snapshot], "2026-09-12T12:00:00.000Z"),
    /period ending after retrieval/
  );
});

test("rejects credential-bearing evidence references at the history boundary", () => {
  const snapshot = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    audienceEvidenceRefs: ["op://Social/Instagram/access-token"]
  });

  assert.throws(
    () => compileSocialSnapshotHistoryLedgerV1([snapshot], "2026-09-10T13:00:00.000Z"),
    /must not contain credential material/
  );
});

test("keeps platform/account histories isolated", () => {
  const instagram = makeSnapshot({
    platform: "INSTAGRAM",
    accountId: "keegan",
    retrievedAt: "2026-09-10T12:00:00.000Z",
    audienceValue: 100
  });
  const facebook = makeSnapshot({
    platform: "FACEBOOK",
    accountId: "keegan",
    retrievedAt: "2026-09-10T12:00:00.000Z",
    audienceValue: 500
  });

  const ledger = compileSocialSnapshotHistoryLedgerV1([facebook, instagram], "2026-09-10T13:00:00.000Z");
  assert.equal(ledger.accounts.length, 2);
  assert.equal(ledger.crossPlatformAggregationPerformed, false);
  const ig = ledger.accounts.find((account) => account.platform === "INSTAGRAM");
  const fb = ledger.accounts.find((account) => account.platform === "FACEBOOK");
  assert.equal(ig?.metricSeries.find((series) => series.metricKey === "AUDIENCE_TOTAL")?.latestPoint?.value, 100);
  assert.equal(fb?.metricSeries.find((series) => series.metricKey === "AUDIENCE_TOTAL")?.latestPoint?.value, 500);
});

test("records evidence-only revisions without pretending the metric changed", () => {
  const first = makeSnapshot({
    retrievedAt: "2026-09-10T12:00:00.000Z",
    audienceValue: 100,
    audienceEvidenceRefs: ["provider:export:a"]
  });
  const second = makeSnapshot({
    retrievedAt: "2026-09-11T12:00:00.000Z",
    audienceValue: 100,
    audienceEvidenceRefs: ["provider:export:b"]
  });

  const ledger = compileSocialSnapshotHistoryLedgerV1([first, second], "2026-09-11T13:00:00.000Z");
  const audience = ledger.accounts[0].metricSeries.find((series) => series.metricKey === "AUDIENCE_TOTAL");
  assert.equal(audience?.points[1].revisionState, "REVISED_EVIDENCE");
  assert.equal(audience?.points[1].value, 100);
});
