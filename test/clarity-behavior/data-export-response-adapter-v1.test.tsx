import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptClarityDataExportResponseV1,
  type ClarityDataExportResponseAdapterInputV1,
} from "@/lib/clarity-behavior/data-export-response-adapter-v1";
import {
  planClarityDataExportRequestV1,
  type ClarityDataExportRequestPlanV1,
} from "@/lib/clarity-behavior/data-export-request-plan-v1";

const REQUESTED_AT = "2026-09-19T14:00:00.000Z";
const NOW = "2026-09-19T14:05:00.000Z";
const EVIDENCE_REF = "clarity-export:2026-09-19T14:00:00Z";
const FALLBACK_WINDOW = {
  startAt: "2026-09-18T14:00:00.000Z",
  endAt: REQUESTED_AT,
} as const;

function readyPlan(dimensions: readonly string[] = []): ClarityDataExportRequestPlanV1 {
  const plan = planClarityDataExportRequestV1({
    requestedAt: REQUESTED_AT,
    lookbackDays: 1,
    dimensions,
    requestsUsedInCurrentQuotaWindow: 2,
    quotaEvidenceRef: "clarity-quota:2026-09-19",
  });
  assert.equal(plan.status, "READY");
  return plan;
}

function input(
  plan: ClarityDataExportRequestPlanV1,
  responseJson: unknown,
  overrides: Partial<ClarityDataExportResponseAdapterInputV1> = {},
): ClarityDataExportResponseAdapterInputV1 {
  return {
    plan,
    responseJson,
    sourceTruth: "COMPLETE",
    observedWindow: plan.expectedUtcWindow ?? FALLBACK_WINDOW,
    fetchedAt: REQUESTED_AT,
    now: NOW,
    maxAgeHours: 6,
    evidenceRef: EVIDENCE_REF,
    ...overrides,
  };
}

test("maps only documented undimensioned Traffic fields into canonical period observations", () => {
  const plan = readyPlan();
  const result = adaptClarityDataExportResponseV1(
    input(plan, [
      {
        metricName: "Traffic",
        information: [
          {
            totalSessionCount: "291942",
            totalBotSessionCount: "31076",
            distantUserCount: "212836",
            PagesPerSessionPercentage: 2.2609,
          },
        ],
      },
    ]),
  );

  assert.equal(result.adapterState, "ADAPTED");
  assert.deepEqual(result.reasonCodes, ["ADAPTED"]);
  assert.equal(result.trafficRows.length, 1);
  assert.equal(result.trafficRows[0].totalSessionCount, 291942);
  assert.equal(result.trafficRows[0].distinctUserCount, 212836);
  assert.equal(result.trafficRows[0].pagesPerSession, 2.2609);
  assert.equal(result.gateResult?.gateState, "ACCEPTED_FOR_HISTORY");
  assert.equal(result.gateResult?.projectedMetrics.sessions, 291942);
  assert.equal(result.gateResult?.projectedMetrics.uniqueUsers, 212836);
  assert.equal(result.gateResult?.projectedMetrics.pagesPerSession, 2.2609);
  assert.equal(result.gateResult?.periodProjectionComplete, false);
  assert.equal(result.gateResult?.projectedMetrics.deadClickSessions, undefined);
  assert.equal(result.authority.networkCallPerformed, false);
  assert.equal(result.authority.persistencePerformed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
});

test("preserves dimensional Traffic rows without summing them into fake period totals", () => {
  const plan = readyPlan(["OS"]);
  const result = adaptClarityDataExportResponseV1(
    input(plan, [
      {
        metricName: "Traffic",
        information: [
          {
            OS: "Other",
            totalSessionCount: "16508",
            totalBotSessionCount: "2636",
            distantUserCount: "13421",
            PagesPerSessionPercentage: 2.0411,
          },
          {
            OS: "Windows",
            totalSessionCount: "177429",
            totalBotSessionCount: "17341",
            distantUserCount: "126672",
            PagesPerSessionPercentage: 2.398,
          },
        ],
      },
    ]),
  );

  assert.equal(result.adapterState, "ADAPTED");
  assert.equal(result.periodAggregationWithheld, true);
  assert.ok(result.reasonCodes.includes("DIMENSIONAL_PERIOD_AGGREGATION_WITHHELD"));
  assert.deepEqual(result.trafficRows.map((row) => row.dimensions.OS), ["Other", "Windows"]);
  assert.deepEqual(result.trafficRows.map((row) => row.totalSessionCount), [16508, 177429]);
  assert.deepEqual(result.gateResult?.projectedMetrics, {});
  assert.equal(result.gateResult?.periodProjectionComplete, false);
});

test("keeps unsupported provider metrics visible without inventing session-scoped friction", () => {
  const plan = readyPlan();
  const result = adaptClarityDataExportResponseV1(
    input(plan, [
      {
        metricName: "Dead Click Count",
        information: [{ DeadClickCount: "412" }],
      },
      {
        metricName: "Quickback Click",
        information: [{ QuickbackClick: "98" }],
      },
    ]),
  );

  assert.equal(result.adapterState, "ADAPTED");
  assert.deepEqual(result.unmappedProviderMetricNames, ["Dead Click Count", "Quickback Click"]);
  assert.ok(result.reasonCodes.includes("PROVIDER_METRIC_UNMAPPED"));
  assert.equal(result.gateResult?.projectedMetrics.deadClickSessions, undefined);
  assert.equal(result.gateResult?.projectedMetrics.quickBackSessions, undefined);
  assert.ok(result.gateResult?.reasonCodes.includes("PERIOD_PROJECTION_INCOMPLETE"));
});

test("marks a 1000-row response partial instead of treating provider truncation as complete", () => {
  const plan = readyPlan(["OS"]);
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    OS: `os-${index}`,
    totalSessionCount: "1",
    totalBotSessionCount: "0",
    distantUserCount: "1",
    PagesPerSessionPercentage: 1,
  }));
  const result = adaptClarityDataExportResponseV1(
    input(plan, [{ metricName: "Traffic", information: rows }]),
  );

  assert.equal(result.adapterState, "ADAPTED");
  assert.equal(result.gateResult?.gateState, "PARTIAL_ONLY");
  assert.ok(result.gateResult?.reasonCodes.includes("ROW_LIMIT_MAY_TRUNCATE"));
  assert.equal(result.gateResult?.coverage.responseRows, 1000);
  assert.equal(result.trafficRows.length, 1000);
});

test("downgrades malformed Traffic cells to partial evidence rather than coercing them", () => {
  const plan = readyPlan();
  const result = adaptClarityDataExportResponseV1(
    input(plan, [
      {
        metricName: "Traffic",
        information: [
          {
            totalSessionCount: "not-a-number",
            distantUserCount: "10",
            PagesPerSessionPercentage: 2,
          },
        ],
      },
    ]),
  );

  assert.equal(result.effectiveSourceTruth, "PARTIAL");
  assert.ok(result.reasonCodes.includes("TRAFFIC_FIELD_INVALID"));
  assert.equal(result.trafficRows[0].totalSessionCount, null);
  assert.equal(result.gateResult?.gateState, "PARTIAL_ONLY");
  assert.equal(result.gateResult?.projectedMetrics.sessions, undefined);
  assert.equal(result.gateResult?.projectedMetrics.uniqueUsers, 10);
});

test("lets the existing live gate reject an observed-window mismatch", () => {
  const plan = readyPlan();
  const result = adaptClarityDataExportResponseV1(
    input(
      plan,
      [{ metricName: "Traffic", information: [{ totalSessionCount: "12" }] }],
      {
        observedWindow: {
          startAt: "2026-09-18T13:59:00.000Z",
          endAt: "2026-09-19T13:59:00.000Z",
        },
      },
    ),
  );

  assert.equal(result.adapterState, "ADAPTED");
  assert.equal(result.gateResult?.gateState, "REJECTED");
  assert.ok(result.gateResult?.reasonCodes.includes("OBSERVED_WINDOW_MISMATCH"));
});

test("rejects non-ready plans, oversized provider tables, and secret-like evidence refs", () => {
  const blockedPlan = planClarityDataExportRequestV1({
    requestedAt: REQUESTED_AT,
    lookbackDays: 1,
    dimensions: [],
    requestsUsedInCurrentQuotaWindow: null,
    quotaEvidenceRef: null,
  });
  const blocked = adaptClarityDataExportResponseV1(
    input(blockedPlan, [{ metricName: "Traffic", information: [] }]),
  );
  assert.equal(blocked.adapterState, "REJECTED");
  assert.deepEqual(blocked.reasonCodes, ["PLAN_NOT_READY"]);
  assert.equal(blocked.gateResult, null);

  const plan = readyPlan();
  const oversized = adaptClarityDataExportResponseV1(
    input(plan, [
      {
        metricName: "Traffic",
        information: Array.from({ length: 1001 }, () => ({ totalSessionCount: "1" })),
      },
    ]),
  );
  assert.equal(oversized.adapterState, "REJECTED");
  assert.deepEqual(oversized.reasonCodes, ["INVALID_RESPONSE"]);

  const secretRef = adaptClarityDataExportResponseV1(
    input(plan, [{ metricName: "Traffic", information: [] }], {
      evidenceRef: "bearer secret-token-value",
    }),
  );
  assert.equal(secretRef.adapterState, "REJECTED");
  assert.deepEqual(secretRef.reasonCodes, ["INVALID_FETCH_CONTEXT"]);
  assert.deepEqual(secretRef.evidenceRefs, []);
});

test("is deterministic, immutable, and does not mutate fetched provider data", () => {
  const plan = readyPlan(["Device"]);
  const response = [
    {
      metricName: "Traffic",
      information: [
        {
          Device: "Mobile",
          totalSessionCount: "25",
          totalBotSessionCount: "0",
          distantUserCount: "20",
          PagesPerSessionPercentage: 1.5,
        },
      ],
    },
  ];
  const before = structuredClone(response);
  const first = adaptClarityDataExportResponseV1(input(plan, response));
  const second = adaptClarityDataExportResponseV1(input(plan, response));

  assert.deepEqual(first, second);
  assert.deepEqual(response, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.trafficRows), true);
  assert.equal(Object.isFrozen(first.trafficRows[0]), true);
  assert.equal(Object.isFrozen(first.gateResult), true);
});
