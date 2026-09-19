import assert from "node:assert/strict";
import test from "node:test";

import {
  CLARITY_DATA_EXPORT_AUTHORIZED_FETCH_VERSION,
  fetchAuthorizedClarityDataExportV1,
} from "@/lib/clarity-behavior/data-export-authorized-fetch-v1";
import {
  planClarityDataExportRequestV1,
  type ClarityDataExportRequestPlanV1,
} from "@/lib/clarity-behavior/data-export-request-plan-v1";

const REQUEST_STARTED_AT = "2026-09-19T15:00:00.000Z";
const RESPONSE_RECEIVED_AT = "2026-09-19T15:00:00.500Z";
const TOKEN = "eyJ.test-token.runtime-only";
const EVIDENCE_REF = "clarity-live-fetch:2026-09-19T15:00:00.000Z";

function readyPlan(): ClarityDataExportRequestPlanV1 {
  const plan = planClarityDataExportRequestV1({
    requestedAt: REQUEST_STARTED_AT,
    lookbackDays: 1,
    dimensions: ["Device", "URL"],
    requestsUsedInCurrentQuotaWindow: 3,
    quotaEvidenceRef: "clarity-quota:2026-09-19:request-count-3",
  });
  assert.equal(plan.status, "READY");
  return plan;
}

function asFetch(
  implementation: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

test("performs one read-only authorized Clarity GET without returning the token", async () => {
  const plan = readyPlan();
  let requestUrl: string | URL | Request | null = null;
  let requestInit: RequestInit | undefined;
  let calls = 0;

  const fetchImpl = asFetch(async (input, init) => {
    calls += 1;
    requestUrl = input;
    requestInit = init;
    return new Response(
      JSON.stringify([
        {
          metricName: "Traffic",
          information: [
            {
              Device: "Mobile",
              URL: "https://keeganhall.com/shop/",
              totalSessionCount: "20",
            },
          ],
        },
      ]),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  });

  const result = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl,
    now: () => RESPONSE_RECEIVED_AT,
  });

  assert.equal(calls, 1);
  assert.equal(requestUrl, plan.requestUrl);
  assert.equal(requestInit?.method, "GET");
  assert.equal(requestInit?.redirect, "error");
  assert.equal(requestInit?.credentials, "omit");
  assert.equal(requestInit?.referrerPolicy, "no-referrer");
  assert.equal(
    (requestInit?.headers as Record<string, string>).Authorization,
    `Bearer ${TOKEN}`,
  );

  assert.equal(result.version, CLARITY_DATA_EXPORT_AUTHORIZED_FETCH_VERSION);
  assert.equal(result.state, "FETCHED");
  assert.equal(result.reasonCode, "FETCHED");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.requestStartedAt, REQUEST_STARTED_AT);
  assert.equal(result.responseReceivedAt, RESPONSE_RECEIVED_AT);
  assert.deepEqual(result.coverage.providerWindow, plan.expectedUtcWindow);
  assert.equal(
    result.coverage.basis,
    "PROVIDER_DOCUMENTED_LOOKBACK_FROM_REQUEST_START",
  );
  assert.equal(result.coverage.providerTimestampObserved, false);
  assert.equal(result.coverage.exactServerReceiptTimeKnown, false);
  assert.equal(result.coverage.mustPassLiveExportGateBeforeHistory, true);
  assert.equal(result.authority.networkCallPerformed, true);
  assert.equal(result.authority.authorizationHeaderUsed, true);
  assert.equal(result.authority.persistencePerformed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.privacy.bearerTokenReturned, false);
  assert.equal(result.privacy.bearerTokenStoredInUrl, false);
  assert.equal(result.privacy.redirectFollowingAllowed, false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal((result.requestUrl as string).includes(TOKEN), false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.coverage));
});

test("fails before network access when plan integrity or request-time identity drifts", async () => {
  const plan = readyPlan();
  let calls = 0;
  const fetchImpl = asFetch(async () => {
    calls += 1;
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const tampered = {
    ...plan,
    requestUrl: "https://example.com/collect?numOfDays=1",
  } as ClarityDataExportRequestPlanV1;
  const tamperedResult = await fetchAuthorizedClarityDataExportV1({
    plan: tampered,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl,
  });
  assert.equal(tamperedResult.state, "REJECTED");
  assert.equal(tamperedResult.reasonCode, "PLAN_INTEGRITY_MISMATCH");
  assert.equal(tamperedResult.requestUrl, null);

  const driftedTime = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: "2026-09-19T15:00:01.000Z",
    evidenceRef: EVIDENCE_REF,
    fetchImpl,
  });
  assert.equal(driftedTime.state, "REJECTED");
  assert.equal(driftedTime.reasonCode, "REQUEST_TIME_MISMATCH");
  assert.equal(driftedTime.coverage.providerWindow, null);
  assert.equal(calls, 0);
});

test("rejects malformed authorization and evidence material without network access", async () => {
  const plan = readyPlan();
  let calls = 0;
  const fetchImpl = asFetch(async () => {
    calls += 1;
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const token = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: "bad\r\ntoken",
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl,
  });
  assert.equal(token.reasonCode, "INVALID_AUTHORIZATION_TOKEN");

  const evidence = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: "access_token=do-not-store",
    fetchImpl,
  });
  assert.equal(evidence.reasonCode, "INVALID_FETCH_CONTEXT");
  assert.deepEqual(evidence.evidenceRefs, []);
  assert.equal(calls, 0);
});

test("maps documented Clarity HTTP failures without reading or surfacing response bodies", async () => {
  const plan = readyPlan();
  const cases = [
    [400, "HTTP_BAD_REQUEST"],
    [401, "HTTP_UNAUTHORIZED"],
    [403, "HTTP_FORBIDDEN"],
    [429, "HTTP_RATE_LIMITED"],
    [503, "HTTP_PROVIDER_ERROR"],
    [418, "HTTP_ERROR"],
  ] as const;

  for (const [status, reasonCode] of cases) {
    const result = await fetchAuthorizedClarityDataExportV1({
      plan,
      bearerToken: TOKEN,
      requestStartedAt: REQUEST_STARTED_AT,
      evidenceRef: EVIDENCE_REF,
      fetchImpl: asFetch(async () =>
        new Response(`provider-error-${TOKEN}`, {
          status,
          headers: { "content-type": "text/plain" },
        }),
      ),
      now: () => RESPONSE_RECEIVED_AT,
    });

    assert.equal(result.state, "REJECTED");
    assert.equal(result.reasonCode, reasonCode);
    assert.equal(result.httpStatus, status);
    assert.equal(result.responseJson, null);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
    assert.equal(result.authority.networkCallPerformed, true);
  }
});

test("fails closed on non-JSON, invalid JSON, and oversized successful responses", async () => {
  const plan = readyPlan();

  const nonJson = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl: asFetch(async () =>
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ),
    now: () => RESPONSE_RECEIVED_AT,
  });
  assert.equal(nonJson.reasonCode, "NON_JSON_RESPONSE");

  const invalidJson = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl: asFetch(async () =>
      new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
    now: () => RESPONSE_RECEIVED_AT,
  });
  assert.equal(invalidJson.reasonCode, "INVALID_JSON_RESPONSE");

  const oversizedByHeader = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl: asFetch(async () =>
      new Response("[]", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "2048",
        },
      }),
    ),
    maxResponseBytes: 1024,
    now: () => RESPONSE_RECEIVED_AT,
  });
  assert.equal(oversizedByHeader.reasonCode, "RESPONSE_TOO_LARGE");
  assert.equal(oversizedByHeader.responseBytes, 2048);

  const oversizedBody = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl: asFetch(async () =>
      new Response(JSON.stringify({ payload: "x".repeat(1500) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
    maxResponseBytes: 1024,
    now: () => RESPONSE_RECEIVED_AT,
  });
  assert.equal(oversizedBody.reasonCode, "RESPONSE_TOO_LARGE");
  assert.ok((oversizedBody.responseBytes ?? 0) > 1024);
});

test("reports network errors without exposing authorization material", async () => {
  const plan = readyPlan();
  const result = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: TOKEN,
    requestStartedAt: REQUEST_STARTED_AT,
    evidenceRef: EVIDENCE_REF,
    fetchImpl: asFetch(async () => {
      throw new Error(`socket failed ${TOKEN}`);
    }),
    now: () => RESPONSE_RECEIVED_AT,
  });

  assert.equal(result.state, "REJECTED");
  assert.equal(result.reasonCode, "NETWORK_ERROR");
  assert.equal(result.authority.networkCallPerformed, true);
  assert.equal(result.authority.authorizationHeaderUsed, true);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});
