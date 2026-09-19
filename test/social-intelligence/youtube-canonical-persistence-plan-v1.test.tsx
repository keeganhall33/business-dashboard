import assert from "node:assert/strict";
import test from "node:test";

import {
  planYouTubeCanonicalPersistenceV1
} from "../../src/lib/social-intelligence/youtube-canonical-persistence-plan-v1";
import {
  YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1,
  runYouTubeAnalyticsChannelReportV1,
  type YouTubeAnalyticsEvidenceRecordV1
} from "../../src/lib/social-intelligence/youtube-analytics-live-runner-v1";
import {
  compileYouTubeCanonicalIngestionHandoffV1
} from "../../src/lib/social-intelligence/youtube-canonical-ingestion-handoff-v1";

function reportBody() {
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

function clock(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

async function fixture() {
  const evidence: YouTubeAnalyticsEvidenceRecordV1[] = [];
  const report = await runYouTubeAnalyticsChannelReportV1(
    {
      connectorId: "youtube-analytics-channel",
      runId: "youtube:persistence:2026-09-18T07:00Z",
      periodId: "youtube-7d-current",
      window: "7D",
      startDate: "2026-09-11",
      endDate: "2026-09-17",
      requestedMetricKeys: ["VIEWS", "WATCH_TIME_SECONDS", "LIKES"],
      previousSuccessfulSyncAt: "2026-09-17T07:00:00.000Z",
      grantedYouTubeScopes: [...YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1]
    },
    async () => ({ status: 200, json: async () => reportBody() }),
    async (record) => {
      evidence.push(record);
      return record.kind === "REQUEST"
        ? "evidence:youtube:request:persistence-1"
        : "evidence:youtube:response:persistence-1";
    },
    clock("2026-09-18T07:00:00.000Z", "2026-09-18T07:00:01.000Z")
  );
  const handoff = compileYouTubeCanonicalIngestionHandoffV1({
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
  });
  assert.equal(handoff.state, "READY_TO_APPEND");
  assert.ok(handoff.projection);
  assert.ok(handoff.syncAcceptance);
  return { report, handoff, snapshot: handoff.projection.snapshot };
}

const priorCheckpoint = {
  cursor: null,
  completedThroughAt: "2026-09-17T07:00:00.000Z"
} as const;

function now() {
  return "2026-09-18T07:00:03.000Z";
}

test("plans append plus compare-and-set checkpoint only for the exact accepted live lineage", async () => {
  const { report, handoff, snapshot } = await fixture();
  const plan = planYouTubeCanonicalPersistenceV1({
    report,
    handoff,
    persistedSnapshots: [],
    persistedCheckpoint: priorCheckpoint,
    now: now()
  });

  assert.equal(plan.disposition, "APPLY");
  assert.deepEqual(plan.reasonCodes, ["READY_TO_APPLY"]);
  assert.equal(plan.candidateSnapshotId, snapshot.snapshotId);
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.operations[0]?.kind, "APPEND_CANONICAL_SNAPSHOT");
  assert.equal(plan.operations[1]?.kind, "COMPARE_AND_SET_CHECKPOINT");
  assert.equal(plan.localCanonicalPersistencePlanAllowed, true);
  assert.equal(plan.canonicalPersistencePerformed, false);
  assert.equal(plan.providerWritesAllowed, false);
  assert.equal(plan.externalActionAuthorityGranted, false);
  assert.equal(plan.causalClaimsCreated, false);
  assert.equal(plan.attributionClaimsCreated, false);
});

test("is idempotent after the exact snapshot and checkpoint are already durable", async () => {
  const { report, handoff, snapshot } = await fixture();
  const plan = planYouTubeCanonicalPersistenceV1({
    report,
    handoff,
    persistedSnapshots: [snapshot],
    persistedCheckpoint: {
      cursor: null,
      completedThroughAt: snapshot.retrievedAt
    },
    now: now()
  });

  assert.equal(plan.disposition, "NOOP");
  assert.deepEqual(plan.reasonCodes, ["ALREADY_PERSISTED"]);
  assert.deepEqual(plan.operations, []);
  assert.equal(plan.localCanonicalPersistencePlanAllowed, false);
});

test("recovers a persisted snapshot with an unadvanced checkpoint without appending a duplicate", async () => {
  const { report, handoff, snapshot } = await fixture();
  const plan = planYouTubeCanonicalPersistenceV1({
    report,
    handoff,
    persistedSnapshots: [snapshot],
    persistedCheckpoint: priorCheckpoint,
    now: now()
  });

  assert.equal(plan.disposition, "APPLY");
  assert.deepEqual(plan.reasonCodes, ["SNAPSHOT_ALREADY_PERSISTED_ADVANCE_CHECKPOINT"]);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]?.kind, "COMPARE_AND_SET_CHECKPOINT");
});

test("fails closed when the durable snapshot identity conflicts instead of overwriting history", async () => {
  const { report, handoff, snapshot } = await fixture();
  const plan = planYouTubeCanonicalPersistenceV1({
    report,
    handoff,
    persistedSnapshots: [{ ...snapshot, handle: "@conflicting-handle" }],
    persistedCheckpoint: priorCheckpoint,
    now: now()
  });

  assert.equal(plan.disposition, "VERIFICATION_REQUIRED");
  assert.deepEqual(plan.reasonCodes, ["SNAPSHOT_CONFLICT"]);
  assert.deepEqual(plan.operations, []);
  assert.equal(plan.localCanonicalPersistencePlanAllowed, false);
});

test("fails closed when the durable checkpoint does not match provider lineage", async () => {
  const { report, handoff } = await fixture();
  const plan = planYouTubeCanonicalPersistenceV1({
    report,
    handoff,
    persistedSnapshots: [],
    persistedCheckpoint: {
      cursor: null,
      completedThroughAt: "2026-09-16T07:00:00.000Z"
    },
    now: now()
  });

  assert.equal(plan.disposition, "VERIFICATION_REQUIRED");
  assert.deepEqual(plan.reasonCodes, ["PROVIDER_LINEAGE_MISMATCH"]);
  assert.deepEqual(plan.operations, []);
});

test("never repairs a checkpoint that is already ahead when the canonical snapshot is missing", async () => {
  const { report, handoff, snapshot } = await fixture();
  const plan = planYouTubeCanonicalPersistenceV1({
    report,
    handoff,
    persistedSnapshots: [],
    persistedCheckpoint: {
      cursor: null,
      completedThroughAt: snapshot.retrievedAt
    },
    now: now()
  });

  assert.equal(plan.disposition, "VERIFICATION_REQUIRED");
  assert.deepEqual(plan.reasonCodes, ["CHECKPOINT_AHEAD_OF_SNAPSHOT"]);
  assert.deepEqual(plan.operations, []);
});

test("rejects widened upstream write or action authority", async () => {
  const { report, handoff } = await fixture();
  const tampered = {
    ...handoff,
    canonicalPersistenceAuthorized: true
  } as unknown as typeof handoff;
  const plan = planYouTubeCanonicalPersistenceV1({
    report,
    handoff: tampered,
    persistedSnapshots: [],
    persistedCheckpoint: priorCheckpoint,
    now: now()
  });

  assert.equal(plan.disposition, "VERIFICATION_REQUIRED");
  assert.deepEqual(plan.reasonCodes, ["HANDOFF_AUTHORITY_WIDENED"]);
  assert.equal(plan.providerWritesAllowed, false);
  assert.equal(plan.externalActionAuthorityGranted, false);
});
