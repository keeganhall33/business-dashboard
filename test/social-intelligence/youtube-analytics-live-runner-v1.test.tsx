import assert from "node:assert/strict";
import test from "node:test";

import {
  YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1,
  runYouTubeAnalyticsChannelReportV1,
  type RunYouTubeAnalyticsChannelReportInputV1,
  type YouTubeAnalyticsEvidenceRecordV1
} from "../../src/lib/social-intelligence/youtube-analytics-live-runner-v1";

const scopes = [...YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1];

function baseInput(): RunYouTubeAnalyticsChannelReportInputV1 {
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

function clock(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

function evidenceSink(records: YouTubeAnalyticsEvidenceRecordV1[]) {
  return async (record: YouTubeAnalyticsEvidenceRecordV1): Promise<string> => {
    records.push(record);
    return record.kind === "REQUEST" ? "evidence:youtube:request:run-1" : "evidence:youtube:response:run-1";
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

test("performs one read-only authorized YouTube Analytics query and normalizes only fully evidenced daily coverage", async () => {
  const records: YouTubeAnalyticsEvidenceRecordV1[] = [];
  let fetchCount = 0;
  const result = await runYouTubeAnalyticsChannelReportV1(
    baseInput(),
    async (url, init) => {
      fetchCount += 1;
      const parsed = new URL(url);
      assert.equal(init.method, "GET");
      assert.deepEqual(init.headers, { accept: "application/json" });
      assert.equal(parsed.origin, "https://youtubeanalytics.googleapis.com");
      assert.equal(parsed.pathname, "/v2/reports");
      assert.equal(parsed.searchParams.get("ids"), "channel==MINE");
      assert.equal(parsed.searchParams.get("dimensions"), "day");
      assert.equal(parsed.searchParams.get("startDate"), "2026-09-11");
      assert.equal(parsed.searchParams.get("endDate"), "2026-09-17");
      assert.equal(parsed.searchParams.get("metrics"), "views,estimatedMinutesWatched,likes");
      assert.equal(/token|secret|authorization/i.test(url), false);
      return { status: 200, json: async () => completeBody() };
    },
    evidenceSink(records),
    clock("2026-09-18T07:00:00.000Z", "2026-09-18T07:00:01.000Z")
  );

  assert.equal(fetchCount, 1);
  assert.equal(result.providerRun.runState, "COMPLETE");
  assert.equal(result.providerRun.externalAccessPerformed, true);
  assert.equal(result.providerRun.writesPerformed, false);
  assert.equal(result.completeRequestedDailyCoverage, true);
  assert.equal(result.observedStartDate, "2026-09-11");
  assert.equal(result.observedEndDate, "2026-09-17");
  assert.equal(result.normalization?.normalizationState, "READY");
  assert.equal(result.normalization?.canonicalPeriod.metrics.VIEWS.value, 70);
  assert.equal(result.normalization?.canonicalPeriod.metrics.WATCH_TIME_SECONDS.value, 840);
  assert.equal(result.normalization?.canonicalPeriod.metrics.LIKES.value, 7);
  assert.deepEqual(result.evidenceRefs, ["evidence:youtube:request:run-1", "evidence:youtube:response:run-1"]);
  assert.equal(records.length, 2);
  assert.equal(records[0]?.kind, "REQUEST");
  assert.equal(records[1]?.kind, "RESPONSE");
  assert.equal(result.authorizationBoundary, "READ_ONLY_REQUIRED_SCOPES_ONLY");
  assert.equal(result.providerWritesPerformed, false);
  assert.equal(result.causalAttributionClaimed, false);
});

test("fails closed when even one requested UTC day is not evidenced", async () => {
  const records: YouTubeAnalyticsEvidenceRecordV1[] = [];
  const body = completeBody();
  body.rows.splice(3, 1);
  const result = await runYouTubeAnalyticsChannelReportV1(
    baseInput(),
    async () => ({ status: 200, json: async () => body }),
    evidenceSink(records),
    clock("2026-09-18T08:00:00.000Z", "2026-09-18T08:00:01.000Z")
  );

  assert.equal(result.providerRun.runState, "PARTIAL");
  assert.equal(result.providerRun.providerRunComplete, false);
  assert.equal(result.completeRequestedDailyCoverage, false);
  assert.equal(result.normalization, null);
  assert.match(result.limitations.join(" "), /2026-09-14 has no evidenced row/i);
});

test("rejects current-day ranges before any provider access or evidence claim", async () => {
  let fetchCount = 0;
  let evidenceCount = 0;
  await assert.rejects(
    () =>
      runYouTubeAnalyticsChannelReportV1(
        { ...baseInput(), startDate: "2026-09-12", endDate: "2026-09-18" },
        async () => {
          fetchCount += 1;
          return { status: 200, json: async () => completeBody() };
        },
        async () => {
          evidenceCount += 1;
          return "evidence:unexpected";
        },
        clock("2026-09-18T09:00:00.000Z")
      ),
    /endDate must be before the current UTC date/i
  );
  assert.equal(fetchCount, 0);
  assert.equal(evidenceCount, 0);
});

test("requires only the documented read-only YouTube scopes", async () => {
  let fetchCount = 0;
  await assert.rejects(
    () =>
      runYouTubeAnalyticsChannelReportV1(
        {
          ...baseInput(),
          grantedYouTubeScopes: [...scopes, "https://www.googleapis.com/auth/youtube"]
        },
        async () => {
          fetchCount += 1;
          return { status: 200, json: async () => completeBody() };
        },
        async () => "evidence:unexpected",
        clock("2026-09-18T09:00:00.000Z")
      ),
    /exactly the documented read-only YouTube scopes/i
  );
  assert.equal(fetchCount, 0);
});

test("surfaces rate limiting without admitting provider values", async () => {
  const records: YouTubeAnalyticsEvidenceRecordV1[] = [];
  const result = await runYouTubeAnalyticsChannelReportV1(
    baseInput(),
    async () => ({
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "120" : null) },
      json: async () => ({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } })
    }),
    evidenceSink(records),
    clock("2026-09-18T10:00:00.000Z", "2026-09-18T10:00:01.000Z")
  );

  assert.equal(result.providerRun.runState, "FAILED");
  assert.equal(result.providerRun.interruptionReason, "RATE_LIMIT");
  assert.equal(result.providerRun.retryAfterAt, "2026-09-18T10:02:01.000Z");
  assert.equal(result.normalization, null);
  assert.match(result.limitations.join(" "), /HTTP 429/i);
});

test("surfaces network failure without leaking the authorization closure", async () => {
  const secret = "oauth-secret-that-must-not-escape";
  const records: YouTubeAnalyticsEvidenceRecordV1[] = [];
  const result = await runYouTubeAnalyticsChannelReportV1(
    baseInput(),
    async () => {
      void secret;
      throw new Error(`network failed with ${secret}`);
    },
    evidenceSink(records),
    clock("2026-09-18T11:00:00.000Z", "2026-09-18T11:00:01.000Z")
  );

  assert.equal(result.providerRun.runState, "FAILED");
  assert.equal(result.providerRun.interruptionReason, "NETWORK_ERROR");
  assert.equal(result.normalization, null);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.kind, "REQUEST");
});

test("fails closed on a successful HTTP response with mismatched report columns", async () => {
  const records: YouTubeAnalyticsEvidenceRecordV1[] = [];
  const body = completeBody();
  body.columnHeaders[1] = { name: "subscribersGained", columnType: "METRIC", dataType: "INTEGER" };
  const result = await runYouTubeAnalyticsChannelReportV1(
    baseInput(),
    async () => ({ status: 200, json: async () => body }),
    evidenceSink(records),
    clock("2026-09-18T12:00:00.000Z", "2026-09-18T12:00:01.000Z")
  );

  assert.equal(result.providerRun.runState, "FAILED");
  assert.equal(result.providerRun.interruptionReason, "PROVIDER_ERROR");
  assert.equal(result.normalization, null);
  assert.match(result.limitations.join(" "), /schema or metric values failed strict validation/i);
});

test("does not synthesize unsupported canonical metrics", async () => {
  await assert.rejects(
    () =>
      runYouTubeAnalyticsChannelReportV1(
        { ...baseInput(), requestedMetricKeys: ["AUDIENCE_TOTAL"] as never },
        async () => ({ status: 200, json: async () => completeBody() }),
        async () => "evidence:unexpected",
        clock("2026-09-18T13:00:00.000Z")
      ),
    /unsupported YouTube Analytics canonical metric/i
  );
});
