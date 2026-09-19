import assert from "node:assert/strict";
import test from "node:test";

import {
  CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION,
  runClarityDataExportLiveV1,
  type ClarityDataExportLiveRunnerInputV1,
} from "@/lib/clarity-behavior/data-export-live-runner-v1";

const TOKEN = "eyJ.runtime-only.clarity-token";
const EVIDENCE_REF = "clarity-live-run:2026-09-19T16:00:00.000Z";
const QUOTA_REF = "clarity-quota:2026-09-19:request-count-2";
const REQUEST_STARTED_AT = "2026-09-19T16:00:00.000Z";
const RESPONSE_RECEIVED_AT = "2026-09-19T16:00:00.500Z";
const EVALUATED_AT = "2026-09-19T16:00:01.000Z";

function sequenceClock(...values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function asFetch(
  implementation: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

function trafficResponse(): Response {
  return new Response(
    JSON.stringify([
      {
        metricName: "Traffic",
        information: [
          {
            totalSessionCount: "20",
            distantUserCount: "15",
            PagesPerSessionPercentage: "2.5",
          },
        ],
      },
    ]),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

function baseInput(
  overrides: Partial<ClarityDataExportLiveRunnerInputV1> = {},
): ClarityDataExportLiveRunnerInputV1 {
  return {
    lookbackDays: 1,
    dimensions: [],
    requestsUsedInCurrentQuotaWindow: 2,
    quotaEvidenceRef: QUOTA_REF,
    bearerToken: TOKEN,
    sourceTruth: "COMPLETE",
    maxAgeHours: 1,
    evidenceRef: EVIDENCE_REF,
    fetchImpl: asFetch(async () => trafficResponse()),
    now: sequenceClock(REQUEST_STARTED_AT, RESPONSE_RECEIVED_AT, EVALUATED_AT),
    ...overrides,
  };
}

test("captures request chronology and binds adapter provenance to the authorized fetch", async () => {
  let calls = 0;
  const fetchImpl = asFetch(async () => {
    calls += 1;
    return trafficResponse();
  });

  const result = await runClarityDataExportLiveV1(
    baseInput({
      fetchImpl,
      now: sequenceClock(
        REQUEST_STARTED_AT,
        RESPONSE_RECEIVED_AT,
        EVALUATED_AT,
      ),
    }),
  );

  assert.equal(calls, 1);
  assert.equal(result.version, CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION);
  assert.equal(result.state, "ADAPTED");
  assert.equal(result.reasonCode, "ADAPTED");
  assert.equal(result.plan?.requestedAt, REQUEST_STARTED_AT);
  assert.equal(result.fetchResult?.requestStartedAt, REQUEST_STARTED_AT);
  assert.equal(result.fetchResult?.responseReceivedAt, RESPONSE_RECEIVED_AT);
  assert.equal(result.chronology.requestStartedAt, REQUEST_STARTED_AT);
  assert.equal(result.chronology.responseReceivedAt, RESPONSE_RECEIVED_AT);
  assert.equal(result.chronology.evaluatedAt, EVALUATED_AT);
  assert.deepEqual(
    result.adapterResult?.gateResult?.observedWindow,
    result.fetchResult?.coverage.providerWindow,
  );
  assert.equal(
    result.adapterResult?.gateResult?.extractedAt,
    result.fetchResult?.responseReceivedAt,
  );
  assert.equal(result.provenance.requestStartCapturedByRunner, true);
  assert.equal(result.provenance.observedWindowBoundToAuthorizedFetch, true);
  assert.equal(result.provenance.extractedAtBoundToAuthorizedFetch, true);
  assert.equal(result.provenance.sourceTruthSuppliedExplicitly, true);
  assert.equal(result.provenance.sourceTruthInferredFromHttpStatus, false);
  assert.deepEqual(result.provenance.transportEvidenceRefs, [EVIDENCE_REF]);
  assert.equal(result.authority.networkCallPerformed, true);
  assert.equal(result.authority.authorizationHeaderUsed, true);
  assert.equal(result.authority.persistencePerformed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.privacy.bearerTokenReturned, false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.provenance));
});

test("does not upgrade PARTIAL source truth because the provider returned HTTP 200", async () => {
  const result = await runClarityDataExportLiveV1(
    baseInput({
      sourceTruth: "PARTIAL",
      now: sequenceClock(
        REQUEST_STARTED_AT,
        RESPONSE_RECEIVED_AT,
        EVALUATED_AT,
      ),
    }),
  );

  assert.equal(result.state, "ADAPTED");
  assert.equal(result.adapterResult?.effectiveSourceTruth, "PARTIAL");
  assert.notEqual(
    result.adapterResult?.gateResult?.gateState,
    "ACCEPTED_FOR_HISTORY",
  );
  assert.equal(result.provenance.sourceTruthInferredFromHttpStatus, false);
});

test("blocks exhausted quota before credential use or network access", async () => {
  let calls = 0;
  const result = await runClarityDataExportLiveV1(
    baseInput({
      requestsUsedInCurrentQuotaWindow: 10,
      fetchImpl: asFetch(async () => {
        calls += 1;
        return trafficResponse();
      }),
      now: sequenceClock(REQUEST_STARTED_AT),
    }),
  );

  assert.equal(calls, 0);
  assert.equal(result.state, "REJECTED_BEFORE_FETCH");
  assert.equal(result.reasonCode, "PLAN_BLOCKED");
  assert.equal(result.plan?.reasonCode, "QUOTA_EXHAUSTED");
  assert.equal(result.fetchResult, null);
  assert.equal(result.authority.networkCallPerformed, false);
  assert.equal(result.authority.authorizationHeaderUsed, false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("short-circuits adapter work when the authorized fetch is rejected", async () => {
  const result = await runClarityDataExportLiveV1(
    baseInput({
      fetchImpl: asFetch(async () =>
        new Response("rate limited", {
          status: 429,
          headers: { "content-type": "text/plain" },
        }),
      ),
      now: sequenceClock(REQUEST_STARTED_AT, RESPONSE_RECEIVED_AT),
    }),
  );

  assert.equal(result.state, "FETCH_REJECTED");
  assert.equal(result.reasonCode, "FETCH_REJECTED");
  assert.equal(result.fetchResult?.reasonCode, "HTTP_RATE_LIMITED");
  assert.equal(result.adapterResult, null);
  assert.equal(result.authority.networkCallPerformed, true);
  assert.equal(result.authority.authorizationHeaderUsed, true);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("rejects caller attempts to inject observed coverage or extraction timestamps", async () => {
  let calls = 0;
  const spoofed = {
    ...baseInput({
      fetchImpl: asFetch(async () => {
        calls += 1;
        return trafficResponse();
      }),
      now: sequenceClock(REQUEST_STARTED_AT),
    }),
    observedWindow: {
      startAt: "2020-01-01T00:00:00.000Z",
      endAt: "2020-01-02T00:00:00.000Z",
    },
    fetchedAt: "2020-01-02T00:00:00.000Z",
  } as unknown as ClarityDataExportLiveRunnerInputV1;

  const result = await runClarityDataExportLiveV1(spoofed);

  assert.equal(calls, 0);
  assert.equal(result.state, "REJECTED_BEFORE_FETCH");
  assert.equal(result.reasonCode, "INVALID_INPUT");
  assert.equal(result.plan, null);
  assert.equal(result.fetchResult, null);
});

test("fails closed when a successful transport returns a malformed provider payload", async () => {
  const result = await runClarityDataExportLiveV1(
    baseInput({
      fetchImpl: asFetch(async () =>
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
      now: sequenceClock(
        REQUEST_STARTED_AT,
        RESPONSE_RECEIVED_AT,
        EVALUATED_AT,
      ),
    }),
  );

  assert.equal(result.state, "ADAPTER_REJECTED");
  assert.equal(result.reasonCode, "ADAPTER_REJECTED");
  assert.equal(result.fetchResult?.state, "FETCHED");
  assert.equal(result.adapterResult?.adapterState, "REJECTED");
  assert.deepEqual(result.adapterResult?.reasonCodes, ["INVALID_RESPONSE"]);
  assert.equal(result.adapterResult?.gateResult, null);
  assert.equal(result.authority.persistencePerformed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
});
