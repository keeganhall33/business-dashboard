import assert from "node:assert/strict";
import test from "node:test";

import {
  CLARITY_DATA_EXPORT_ENDPOINT_V1,
  CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY,
  CLARITY_DATA_EXPORT_ROW_LIMIT,
  planClarityDataExportRequestV1,
} from "../../src/lib/clarity-behavior/data-export-request-plan-v1";

const BASE = {
  requestedAt: "2026-09-19T13:30:00.000Z",
  lookbackDays: 3,
  dimensions: ["Device", "URL"],
  requestsUsedInCurrentQuotaWindow: 4,
  quotaEvidenceRef: "clarity-quota:2026-09-19:request-count-4",
} as const;

test("prepares one bounded Clarity Data Export GET without embedding credentials", () => {
  const plan = planClarityDataExportRequestV1(BASE);

  assert.equal(plan.status, "READY");
  assert.equal(plan.reasonCode, "REQUEST_READY");
  assert.equal(plan.expectedUtcWindow?.startAt, "2026-09-16T13:30:00.000Z");
  assert.equal(plan.expectedUtcWindow?.endAt, BASE.requestedAt);
  assert.equal(plan.providerLimits.maximumRows, CLARITY_DATA_EXPORT_ROW_LIMIT);
  assert.equal(plan.providerLimits.paginationSupported, false);
  assert.equal(plan.quota.maxRequestsPerProjectPerDay, CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY);
  assert.equal(plan.quota.oneRequestReservedByPlan, true);
  assert.equal(plan.handoff.bearerTokenIncludedInPlan, false);
  assert.equal(plan.handoff.responseMustPassLiveExportGate, true);
  assert.equal(plan.authority.networkCallPerformed, false);
  assert.equal(plan.authority.credentialAccessPerformed, false);

  const url = new URL(plan.requestUrl as string);
  assert.equal(`${url.origin}${url.pathname}`, CLARITY_DATA_EXPORT_ENDPOINT_V1);
  assert.equal(url.searchParams.get("numOfDays"), "3");
  assert.equal(url.searchParams.get("dimension1"), "Device");
  assert.equal(url.searchParams.get("dimension2"), "URL");
  assert.equal(url.searchParams.get("dimension3"), null);
  assert.equal(url.searchParams.has("token"), false);
  assert.equal(url.searchParams.has("access_token"), false);
});

test("blocks when quota state is unknown instead of risking an untracked provider request", () => {
  const unknownCount = planClarityDataExportRequestV1({
    ...BASE,
    requestsUsedInCurrentQuotaWindow: null,
  });
  assert.equal(unknownCount.status, "BLOCKED");
  assert.equal(unknownCount.reasonCode, "QUOTA_STATE_UNKNOWN");
  assert.equal(unknownCount.requestUrl, null);

  const missingEvidence = planClarityDataExportRequestV1({
    ...BASE,
    quotaEvidenceRef: null,
  });
  assert.equal(missingEvidence.status, "BLOCKED");
  assert.equal(missingEvidence.reasonCode, "QUOTA_STATE_UNKNOWN");
  assert.equal(missingEvidence.requestUrl, null);
});

test("blocks when the documented daily request budget is exhausted", () => {
  const plan = planClarityDataExportRequestV1({
    ...BASE,
    requestsUsedInCurrentQuotaWindow: 10,
  });

  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.reasonCode, "QUOTA_EXHAUSTED");
  assert.equal(plan.requestUrl, null);
  assert.equal(plan.quota.oneRequestReservedByPlan, false);
});

test("fails closed on unsupported lookbacks, dimensions, and duplicates", () => {
  const lookback = planClarityDataExportRequestV1({ ...BASE, lookbackDays: 7 });
  assert.equal(lookback.reasonCode, "UNSUPPORTED_LOOKBACK");

  const tooMany = planClarityDataExportRequestV1({
    ...BASE,
    dimensions: ["Device", "URL", "Source", "Browser"],
  });
  assert.equal(tooMany.reasonCode, "TOO_MANY_DIMENSIONS");

  const unsupported = planClarityDataExportRequestV1({
    ...BASE,
    dimensions: ["Device", "City"],
  });
  assert.equal(unsupported.reasonCode, "UNSUPPORTED_DIMENSION");

  const duplicate = planClarityDataExportRequestV1({
    ...BASE,
    dimensions: ["Device", "Device"],
  });
  assert.equal(duplicate.reasonCode, "DUPLICATE_DIMENSION");
});

test("does not accept quota evidence refs that may contain credentials", () => {
  const plan = planClarityDataExportRequestV1({
    ...BASE,
    quotaEvidenceRef: "access_token=do-not-store-this",
  });

  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.reasonCode, "QUOTA_STATE_UNKNOWN");
  assert.equal(plan.quota.quotaEvidenceRef, null);
});

test("marks the planned UTC window as expectation only, never observed coverage", () => {
  const plan = planClarityDataExportRequestV1({
    ...BASE,
    lookbackDays: 1,
    dimensions: [],
  });

  assert.equal(plan.status, "READY");
  assert.equal(plan.expectedUtcWindow?.startAt, "2026-09-18T13:30:00.000Z");
  assert.equal(plan.handoff.expectedWindowIsProviderRequestExpectationOnly, true);
  assert.equal(plan.handoff.observedWindowMustBeVerifiedFromFetchContext, true);
});
