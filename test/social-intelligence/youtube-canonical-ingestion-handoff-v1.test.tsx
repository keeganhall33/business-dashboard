import assert from "node:assert/strict";
import test from "node:test";

import {
  compileYouTubeCanonicalIngestionHandoffV1
} from "../../src/lib/social-intelligence/youtube-canonical-ingestion-handoff-v1";
import {
  YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1,
  runYouTubeAnalyticsChannelReportV1,
  type RunYouTubeAnalyticsChannelReportInputV1,
  type YouTubeAnalyticsChannelLiveRunV1,
  type YouTubeAnalyticsEvidenceRecordV1
} from "../../src/lib/social-intelligence/youtube-analytics-live-runner-v1";

const scopes = [...YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1];

function reportInput(): RunYouTubeAnalyticsChannelReportInputV1 {
  return {
    connectorId: "youtube-analytics-channel",
    runId: "youtube:2026-09-18T07:00Z",
    periodId: "youtube-7d-current",
    window: "7D",
    startDate: "2026-09-11",
    endDate: "2026-09-17",
    requestedMetricKeys: ["VIEWS", "WATCH_TIME_SECONDS", "LIKES"],
    previousSuccessfulSyncAt: "2026-09-17T07:00:00.000Z",
    grantedYouTubeScopes: scopes
  };
}

function completeBody() {
  return {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "day", columnType: "DIMENSION", dataType: "STRING" },
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      { name: "estimatedMinutesWatched", columnType: "METRIC", dataType: "INTEGER" },
      { name: "likes", columnType: "METRIC", dataType: "INTEGER" }
    ],
    rows: Array.from({ length: 7 }, (_, index) => [
      `2026-09-${String(11 + index).padStart(2, "0")}`,
      10,
      2,
      1
    ])
  };
}

function evidenceSink(records: YouTubeAnalyticsEvidenceRecordV1[]) {
  return async (record: YouTubeAnalyticsEvidenceRecordV1): Promise<string> => {
    records.push(record);
    return record.kind === "REQUEST" ? "evidence:youtube:request:handoff-1" : "evidence:youtube:response:handoff-1";
  };
}

function clock(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

async function completeReport(): Promise<YouTubeAnalyticsChannelLiveRunV1> {
  const records: YouTubeAnalyticsEvidenceRecordV1[] = [];
  return runYouTubeAnalyticsChannelReportV1(
    reportInput(),
    async () => ({ status: 200, json: async () => completeBody() }),
    evidenceSink(records),
    clock("2026-09-18T07:00:00.000Z", "2026-09-18T07:00:01.000Z")
  );
}

function compileInput(report: YouTubeAnalyticsChannelLiveRunV1) {
  return {
    report,
    accountId: "youtube-channel-123",
    handle: "@keeganhall",
    existingSnapshots: [],
    now: "2026-09-18T07:00:02.000Z",
    freshnessMaxAgeHours: 48,
    staleAfterHours: 48,
    priorCheckpoint: {
      cursor: null,
      completedThroughAt: "2026-09-17T07:00:00.000Z"
    }
  } as const;
}

test("hands a complete evidenced YouTube report into canonical snapshot, live-proof acceptance, and append-only history", async () => {
  const report = await completeReport();
  const handoff = compileYouTubeCanonicalIngestionHandoffV1(compileInput(report));

  assert.equal(handoff.state, "READY_TO_APPEND");
  assert.deepEqual(handoff.blockers, []);
  assert.equal(handoff.projection?.projectionState, "READY");
  assert.equal(handoff.projection?.snapshot.platform, "YOUTUBE");
  assert.equal(handoff.projection?.snapshot.accountId, "youtube-channel-123");
  assert.equal(handoff.projection?.snapshot.periods[0]?.metrics.VIEWS.value, 70);
  assert.equal(handoff.projection?.snapshot.periods[0]?.metrics.WATCH_TIME_SECONDS.value, 840);
  assert.equal(handoff.syncAcceptance?.outcome, "SUCCESS");
  assert.equal(handoff.syncAcceptance?.acceptedForLiveProof, true);
  assert.equal(handoff.syncAcceptance?.proof?.liveFirstPartyData, true);
  assert.equal(handoff.appendPlan?.decision, "APPEND");
  assert.equal(handoff.projectedLedger?.snapshotCount, 1);
  assert.equal(handoff.projectedLedger?.accounts[0]?.decisionReady, true);
  assert.equal(handoff.providerAccessObserved, true);
  assert.equal(handoff.providerWritesPerformed, false);
  assert.equal(handoff.canonicalPersistencePerformed, false);
  assert.equal(handoff.canonicalPersistenceAuthorized, false);
  assert.equal(handoff.causalClaimsCreated, false);
  assert.equal(handoff.attributionClaimsCreated, false);
  assert.equal(handoff.externalActionAuthorityGranted, false);
  assert.deepEqual(handoff.providerEvidenceRefs, [
    "evidence:youtube:request:handoff-1",
    "evidence:youtube:response:handoff-1"
  ]);
});

test("is idempotent when the exact canonical capture already exists", async () => {
  const report = await completeReport();
  const first = compileYouTubeCanonicalIngestionHandoffV1(compileInput(report));
  assert.ok(first.projection);

  const second = compileYouTubeCanonicalIngestionHandoffV1({
    ...compileInput(report),
    existingSnapshots: [first.projection.snapshot]
  });

  assert.equal(second.state, "ALREADY_PRESENT");
  assert.equal(second.appendPlan?.decision, "NOOP_DUPLICATE");
  assert.equal(second.projectedLedger?.snapshotCount, 1);
  assert.equal(second.canonicalPersistencePerformed, false);
});

test("fails closed before canonical truth when YouTube daily coverage is incomplete", async () => {
  const records: YouTubeAnalyticsEvidenceRecordV1[] = [];
  const body = completeBody();
  body.rows.splice(2, 1);
  const report = await runYouTubeAnalyticsChannelReportV1(
    reportInput(),
    async () => ({ status: 200, json: async () => body }),
    evidenceSink(records),
    clock("2026-09-18T08:00:00.000Z", "2026-09-18T08:00:01.000Z")
  );

  const handoff = compileYouTubeCanonicalIngestionHandoffV1({
    ...compileInput(report),
    now: "2026-09-18T08:00:02.000Z"
  });

  assert.equal(handoff.state, "WITHHELD");
  assert.ok(handoff.blockers.includes("PROVIDER_RUN_NOT_COMPLETE"));
  assert.ok(handoff.blockers.includes("DAILY_COVERAGE_INCOMPLETE"));
  assert.ok(handoff.blockers.includes("NORMALIZATION_MISSING"));
  assert.equal(handoff.projection, null);
  assert.equal(handoff.syncAcceptance, null);
  assert.equal(handoff.appendPlan, null);
  assert.equal(handoff.projectedLedger, null);
});

test("surfaces a conflicting valid canonical capture for verification instead of overwriting history", async () => {
  const report = await completeReport();
  const first = compileYouTubeCanonicalIngestionHandoffV1(compileInput(report));
  assert.ok(first.projection);
  const conflictingExisting = {
    ...first.projection.snapshot,
    handle: "@different-handle"
  };

  const handoff = compileYouTubeCanonicalIngestionHandoffV1({
    ...compileInput(report),
    existingSnapshots: [conflictingExisting]
  });

  assert.equal(handoff.state, "VERIFY_CONFLICT");
  assert.deepEqual(handoff.blockers, ["HISTORY_CONFLICT"]);
  assert.equal(handoff.appendPlan?.decision, "VERIFY_CONFLICT");
  assert.equal(handoff.projectedLedger, null);
  assert.equal(handoff.canonicalPersistenceAuthorized, false);
});

test("rejects tampered provider-run identity instead of rebinding evidence to another run", async () => {
  const report = await completeReport();
  const tampered = {
    ...report,
    providerRun: {
      ...report.providerRun,
      runId: "youtube:other-run"
    }
  } as YouTubeAnalyticsChannelLiveRunV1;

  assert.throws(
    () => compileYouTubeCanonicalIngestionHandoffV1(compileInput(tampered)),
    /report and provider-run identity must match exactly/i
  );
});

test("rejects a prior checkpoint that does not match provider previous-success lineage", async () => {
  const report = await completeReport();
  assert.throws(
    () =>
      compileYouTubeCanonicalIngestionHandoffV1({
        ...compileInput(report),
        priorCheckpoint: {
          cursor: null,
          completedThroughAt: "2026-09-16T07:00:00.000Z"
        }
      }),
    /previous-success lineage exactly/i
  );
});