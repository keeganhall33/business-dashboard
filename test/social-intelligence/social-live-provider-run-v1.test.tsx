import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialLiveProviderRunV1,
  toSocialProviderNormalizationContextV1,
  type SocialLiveProviderRunInputV1
} from "../../src/lib/social-intelligence/social-live-provider-run-v1";
import { compileSocialProviderMetricNormalizationV1 } from "../../src/lib/social-intelligence/social-provider-metric-normalization-v1";

const now = "2026-09-18T20:00:00Z";

function completeRunInput(): SocialLiveProviderRunInputV1 {
  return {
    platform: "INSTAGRAM",
    connectorId: "meta-graph-instagram",
    runId: "ig-live-run-2026-09-18T19:00Z",
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    externalAccessPerformed: true,
    writesPerformed: false,
    startedAt: "2026-09-18T19:00:00Z",
    retrievedAt: "2026-09-18T19:02:00Z",
    previousSuccessfulSyncAt: "2026-09-17T19:00:00Z",
    requestedMetricKeys: ["AUDIENCE_TOTAL", "REACH"],
    requestedWindows: ["7D"],
    pages: [
      {
        pageIndex: 0,
        capturedAt: "2026-09-18T19:00:30Z",
        itemCount: 25,
        evidenceRefs: ["provider:meta:ig:run-123:page-0"]
      },
      {
        pageIndex: 1,
        capturedAt: "2026-09-18T19:01:30Z",
        itemCount: 10,
        evidenceRefs: ["provider:meta:ig:run-123:page-1"]
      }
    ],
    runState: "COMPLETE",
    paginationExhausted: true,
    limitations: ["Historical depth is provider bounded"]
  };
}

function normalizationInput(runInput: SocialLiveProviderRunInputV1) {
  const run = compileSocialLiveProviderRunV1(runInput, now);
  const context = toSocialProviderNormalizationContextV1(run);
  return {
    ...context,
    periodId: "ig-7d-2026-09-18",
    window: "7D" as const,
    periodStartAt: "2026-09-11T19:00:00Z",
    periodEndAt: "2026-09-18T19:00:00Z",
    mappings: [
      {
        providerMetricKey: "followers_count",
        canonicalMetricKey: "AUDIENCE_TOTAL" as const,
        nativeUnit: "COUNT" as const,
        aggregation: "POINT_IN_TIME" as const,
        providerDefinitionId: "meta:instagram:followers_count:v1",
        definitionEvidenceRefs: ["provider-doc:meta:instagram:followers_count"]
      },
      {
        providerMetricKey: "reach",
        canonicalMetricKey: "REACH" as const,
        nativeUnit: "COUNT" as const,
        aggregation: "PERIOD_TOTAL" as const,
        providerDefinitionId: "meta:instagram:reach:v1",
        definitionEvidenceRefs: ["provider-doc:meta:instagram:reach"]
      }
    ],
    observations: [
      {
        providerMetricKey: "followers_count",
        value: 12_500,
        capturedAt: "2026-09-18T19:00:30Z",
        evidenceRefs: ["provider:meta:ig:run-123:followers"]
      },
      {
        providerMetricKey: "reach",
        value: 41_250,
        capturedAt: "2026-09-18T19:01:30Z",
        evidenceRefs: ["provider:meta:ig:run-123:reach"]
      }
    ]
  };
}

test("compiles an evidenced complete authorized read-only provider run", () => {
  const result = compileSocialLiveProviderRunV1(completeRunInput(), now);

  assert.equal(result.contractVersion, "SocialLiveProviderRunV1");
  assert.equal(result.runState, "COMPLETE");
  assert.equal(result.providerRunComplete, true);
  assert.equal(result.normalizationAllowed, true);
  assert.equal(result.resumeRequired, false);
  assert.equal(result.pageCount, 2);
  assert.equal(result.itemCount, 35);
  assert.deepEqual(result.pageEvidenceRefs, [
    "provider:meta:ig:run-123:page-0",
    "provider:meta:ig:run-123:page-1"
  ]);
  assert.equal(result.externalAccessPerformed, true);
  assert.equal(result.writesPerformed, false);
});

test("feeds a complete governed provider run directly into canonical metric normalization", () => {
  const normalized = compileSocialProviderMetricNormalizationV1(normalizationInput(completeRunInput()), now);

  assert.equal(normalized.normalizationState, "READY");
  assert.equal(normalized.providerRunComplete, true);
  assert.equal(normalized.sourceCoverage.requestedState, "CONNECTED_AND_INGESTING");
  assert.equal(normalized.sourceCoverage.lastSuccessfulSyncAt, "2026-09-18T19:02:00.000Z");
  assert.equal(normalized.canonicalPeriod.metrics.AUDIENCE_TOTAL?.value, 12_500);
  assert.equal(normalized.canonicalPeriod.metrics.REACH?.value, 41_250);
  assert.equal(normalized.externalAccessPerformed, false);
  assert.equal(normalized.writesPerformed, false);
});

test("preserves an interrupted paginated run as PARTIAL instead of laundering it into complete live truth", () => {
  const partial: SocialLiveProviderRunInputV1 = {
    ...completeRunInput(),
    pages: [completeRunInput().pages[0]],
    runState: "PARTIAL",
    paginationExhausted: false,
    interruptionReason: "RATE_LIMIT",
    retryAfterAt: "2026-09-18T20:15:00Z",
    limitations: ["Provider rate limit interrupted pagination"]
  };

  const run = compileSocialLiveProviderRunV1(partial, now);
  assert.equal(run.providerRunComplete, false);
  assert.equal(run.normalizationAllowed, true);
  assert.equal(run.resumeRequired, true);
  assert.equal(run.interruptionReason, "RATE_LIMIT");

  const normalized = compileSocialProviderMetricNormalizationV1(normalizationInput(partial), now);
  assert.equal(normalized.normalizationState, "PARTIAL");
  assert.equal(normalized.providerRunComplete, false);
  assert.equal(normalized.sourceCoverage.requestedState, "CONNECTED_PARTIAL");
  assert.equal(normalized.sourceCoverage.lastSuccessfulSyncAt, "2026-09-17T19:00:00.000Z");
});

test("keeps failed runs out of metric normalization", () => {
  const failed: SocialLiveProviderRunInputV1 = {
    ...completeRunInput(),
    pages: [],
    runState: "FAILED",
    paginationExhausted: false,
    interruptionReason: "PROVIDER_ERROR",
    limitations: ["Provider request failed before usable evidence was captured"]
  };

  const run = compileSocialLiveProviderRunV1(failed, now);
  assert.equal(run.providerRunComplete, false);
  assert.equal(run.normalizationAllowed, false);
  assert.throws(() => toSocialProviderNormalizationContextV1(run), /failed provider run cannot enter metric normalization/i);
});

test("requires actual authorized read-only external access and zero provider writes", () => {
  const unauthorized = { ...completeRunInput(), authorizationState: "NEEDS_KEEGAN_CONNECTION" } as unknown as SocialLiveProviderRunInputV1;
  assert.throws(() => compileSocialLiveProviderRunV1(unauthorized, now), /AUTHORIZED state/i);

  const noAccess = { ...completeRunInput(), externalAccessPerformed: false } as unknown as SocialLiveProviderRunInputV1;
  assert.throws(() => compileSocialLiveProviderRunV1(noAccess, now), /actual external provider access/i);

  const writable = { ...completeRunInput(), writesPerformed: true } as unknown as SocialLiveProviderRunInputV1;
  assert.throws(() => compileSocialLiveProviderRunV1(writable, now), /zero provider writes/i);
});

test("rejects fake completeness and discontinuous pagination", () => {
  const incomplete = { ...completeRunInput(), paginationExhausted: false };
  assert.throws(() => compileSocialLiveProviderRunV1(incomplete, now), /COMPLETE provider run requires paginationExhausted=true/i);

  const discontinuous: SocialLiveProviderRunInputV1 = {
    ...completeRunInput(),
    pages: [
      completeRunInput().pages[0],
      { ...completeRunInput().pages[1], pageIndex: 2 }
    ]
  };
  assert.throws(() => compileSocialLiveProviderRunV1(discontinuous, now), /pageIndex must be contiguous/i);

  const partialWithoutReason: SocialLiveProviderRunInputV1 = {
    ...completeRunInput(),
    pages: [completeRunInput().pages[0]],
    runState: "PARTIAL",
    paginationExhausted: false
  };
  assert.throws(() => compileSocialLiveProviderRunV1(partialWithoutReason, now), /requires an explicit interruptionReason/i);
});

test("rejects future or impossible chronology before provider evidence can become canonical input", () => {
  const future = { ...completeRunInput(), retrievedAt: "2026-09-18T20:01:00Z" };
  assert.throws(() => compileSocialLiveProviderRunV1(future, now), /retrievedAt cannot be in the future/i);

  const previousAfterStart = { ...completeRunInput(), previousSuccessfulSyncAt: "2026-09-18T19:00:30Z" };
  assert.throws(() => compileSocialLiveProviderRunV1(previousAfterStart, now), /previousSuccessfulSyncAt cannot be after the current run started/i);

  const pageOutsideRun: SocialLiveProviderRunInputV1 = {
    ...completeRunInput(),
    pages: [{ ...completeRunInput().pages[0], capturedAt: "2026-09-18T18:59:59Z" }]
  };
  assert.throws(() => compileSocialLiveProviderRunV1(pageOutsideRun, now), /capturedAt must fall within the provider run/i);
});

test("rejects credential-bearing provider evidence instead of persisting secrets", () => {
  const secretKey = { ...completeRunInput(), accessToken: "should-never-enter-evidence" } as unknown as SocialLiveProviderRunInputV1;
  assert.throws(() => compileSocialLiveProviderRunV1(secretKey, now), /credential material.*never carry secrets/i);

  const secretRef: SocialLiveProviderRunInputV1 = {
    ...completeRunInput(),
    pages: [{
      ...completeRunInput().pages[0],
      evidenceRefs: ["https://graph.example.test/data?access_token=secret-value"]
    }]
  };
  assert.throws(() => compileSocialLiveProviderRunV1(secretRef, now), /credential query parameters/i);
});

test("does not mutate caller input and freezes governed run evidence", () => {
  const input = completeRunInput();
  const before = JSON.stringify(input);
  const result = compileSocialLiveProviderRunV1(input, now);

  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.requestedMetricKeys), true);
  assert.equal(Object.isFrozen(result.requestedWindows), true);
  assert.equal(Object.isFrozen(result.pageEvidenceRefs), true);
});
