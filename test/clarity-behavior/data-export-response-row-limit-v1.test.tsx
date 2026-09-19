import assert from "node:assert/strict";
import test from "node:test";

import { adaptClarityDataExportResponseV1 } from "@/lib/clarity-behavior/data-export-response-adapter-v1";
import { planClarityDataExportRequestV1 } from "@/lib/clarity-behavior/data-export-request-plan-v1";

const requestedAt = "2026-09-19T14:00:00.000Z";

function plan() {
  const result = planClarityDataExportRequestV1({
    requestedAt,
    lookbackDays: 1,
    dimensions: [],
    requestsUsedInCurrentQuotaWindow: 1,
    quotaEvidenceRef: "clarity-quota:2026-09-19",
  });
  assert.equal(result.status, "READY");
  assert.ok(result.expectedUtcWindow);
  return result;
}

test("treats the provider 1000-row ceiling as response-wide across metric blocks", () => {
  const requestPlan = plan();
  const rows = Array.from({ length: 500 }, (_, index) => ({ value: String(index) }));
  const result = adaptClarityDataExportResponseV1({
    plan: requestPlan,
    responseJson: [
      { metricName: "Dead Click Count", information: rows },
      { metricName: "Quickback Click", information: rows },
    ],
    sourceTruth: "COMPLETE",
    observedWindow: requestPlan.expectedUtcWindow!,
    fetchedAt: requestedAt,
    now: "2026-09-19T14:05:00.000Z",
    maxAgeHours: 6,
    evidenceRef: "clarity-export:response-wide-limit",
  });

  assert.equal(result.adapterState, "ADAPTED");
  assert.equal(result.gateResult?.coverage.responseRows, 1000);
  assert.equal(result.gateResult?.gateState, "PARTIAL_ONLY");
  assert.ok(result.gateResult?.reasonCodes.includes("ROW_LIMIT_MAY_TRUNCATE"));
  assert.deepEqual(result.unmappedProviderMetricNames, ["Dead Click Count", "Quickback Click"]);
});

test("rejects a provider payload exceeding the response-wide row ceiling", () => {
  const requestPlan = plan();
  const result = adaptClarityDataExportResponseV1({
    plan: requestPlan,
    responseJson: [
      {
        metricName: "Dead Click Count",
        information: Array.from({ length: 600 }, () => ({ value: "1" })),
      },
      {
        metricName: "Quickback Click",
        information: Array.from({ length: 401 }, () => ({ value: "1" })),
      },
    ],
    sourceTruth: "COMPLETE",
    observedWindow: requestPlan.expectedUtcWindow!,
    fetchedAt: requestedAt,
    now: "2026-09-19T14:05:00.000Z",
    maxAgeHours: 6,
    evidenceRef: "clarity-export:response-over-limit",
  });

  assert.equal(result.adapterState, "REJECTED");
  assert.deepEqual(result.reasonCodes, ["INVALID_RESPONSE"]);
  assert.equal(result.gateResult, null);
});
