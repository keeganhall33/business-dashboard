import assert from "node:assert/strict";
import test from "node:test";

import {
  CLARITY_LIVE_FRICTION_RATE_VERSION,
  projectClarityLiveFrictionRatesV1,
} from "@/lib/clarity-behavior/live-friction-rate-v1";
import {
  runClarityDataExportLiveV1,
  type ClarityDataExportLiveRunnerInputV1,
  type ClarityDataExportLiveRunnerResultV1,
} from "@/lib/clarity-behavior/data-export-live-runner-v1";

const TOKEN = "eyJ.runtime-only.clarity-token";
const EVIDENCE_REF = "clarity-friction:2026-09-19T18:00:00.000Z";
const REQUEST_STARTED_AT = "2026-09-19T18:00:00.000Z";
const RESPONSE_RECEIVED_AT = "2026-09-19T18:00:00.500Z";
const EVALUATED_AT = "2026-09-19T18:00:01.000Z";

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

function frictionBlock(
  metricName: string,
  percentage: number,
  dimensions: Record<string, string> = {},
): Record<string, unknown> {
  return {
    metricName,
    information: [
      {
        ...dimensions,
        sessionsCount: "200",
        sessionsWithMetricPercentage: percentage,
        sessionsWithoutMetricPercentage: 100 - percentage,
        pagesViews: "350",
        subTotal: "9",
      },
    ],
  };
}

function completeResponse(dimensions: Record<string, string> = {}): unknown[] {
  return [
    {
      metricName: "Traffic",
      information: [
        {
          ...dimensions,
          totalSessionCount: "200",
          distantUserCount: "150",
          PagesPerSessionPercentage: 1.75,
        },
      ],
    },
    frictionBlock("Dead Click Count", 11.5, dimensions),
    frictionBlock("Rage Click Count", 4.5, dimensions),
    frictionBlock("Quickback Click", 13, dimensions),
    frictionBlock("Excessive Scroll", 8, dimensions),
    frictionBlock("Script Error Count", 2, dimensions),
    frictionBlock("Error Click Count", 1.5, dimensions),
  ];
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function baseInput(
  payload: unknown,
  overrides: Partial<ClarityDataExportLiveRunnerInputV1> = {},
): ClarityDataExportLiveRunnerInputV1 {
  return {
    lookbackDays: 1,
    dimensions: [],
    requestsUsedInCurrentQuotaWindow: 1,
    quotaEvidenceRef: "clarity-quota:2026-09-19:request-count-1",
    bearerToken: TOKEN,
    sourceTruth: "COMPLETE",
    maxAgeHours: 1,
    evidenceRef: EVIDENCE_REF,
    fetchImpl: asFetch(async () => jsonResponse(payload)),
    now: sequenceClock(
      REQUEST_STARTED_AT,
      RESPONSE_RECEIVED_AT,
      EVALUATED_AT,
    ),
    ...overrides,
  };
}

async function liveRun(
  payload: unknown,
  overrides: Partial<ClarityDataExportLiveRunnerInputV1> = {},
): Promise<ClarityDataExportLiveRunnerResultV1> {
  const result = await runClarityDataExportLiveV1(baseInput(payload, overrides));
  assert.equal(result.state, "ADAPTED");
  return result;
}

test("projects complete provider friction rates for descriptive behavior review without inventing affected-session counts", async () => {
  const runner = await liveRun(completeResponse());
  const result = projectClarityLiveFrictionRatesV1(runner);

  assert.equal(result.version, CLARITY_LIVE_FRICTION_RATE_VERSION);
  assert.equal(result.state, "READY_FOR_BEHAVIOR_REVIEW");
  assert.deepEqual(result.reasonCodes, ["READY_FOR_BEHAVIOR_REVIEW"]);
  assert.equal(result.observations.length, 6);

  const deadClick = result.observations.find(
    (observation) => observation.metric === "DEAD_CLICK",
  );
  assert.equal(deadClick?.sessionsCount, 200);
  assert.equal(deadClick?.sessionsWithMetricPercent, 11.5);
  assert.equal(deadClick?.sessionsWithoutMetricPercent, 88.5);
  assert.equal(deadClick?.affectedSessionCount, null);
  assert.equal(
    deadClick?.affectedSessionCountReason,
    "PROVIDER_EXPORT_EXPOSES_PERCENTAGE_NOT_EXACT_AFFECTED_SESSION_COUNT",
  );
  assert.equal(deadClick?.evidenceRef, EVIDENCE_REF);

  assert.equal(result.coverage.lookbackDays, 1);
  assert.equal(result.coverage.sourceTruth, "COMPLETE");
  assert.deepEqual(result.evidenceRefs, [EVIDENCE_REF]);
  assert.equal(result.limitations.descriptiveProviderRateOnly, true);
  assert.equal(result.limitations.affectedSessionCountsInferred, false);
  assert.equal(
    result.limitations.providerFrictionRowFieldShapeDocumentedByMicrosoft,
    false,
  );
  assert.equal(result.limitations.longerTrendRequiresRetainedHistory, true);
  assert.equal(result.limitations.causalityEstablished, false);
  assert.equal(result.limitations.attributionEstablished, false);
  assert.equal(result.limitations.statisticalSignificanceEstablished, false);
  assert.equal(result.limitations.monetaryImpactEstablished, false);
  assert.equal(result.limitations.eligibleForConversionRecommendation, false);
  assert.equal(result.authority.persistencePerformed, false);
  assert.equal(result.authority.siteMutationAllowed, false);
  assert.equal(result.authority.checkoutMutationAllowed, false);
  assert.equal(result.authority.trackingMutationAllowed, false);
  assert.equal(result.authority.pricingMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("preserves requested dimensions without aggregating segment rates", async () => {
  const runner = await liveRun(completeResponse({ URL: "/checkout" }), {
    dimensions: ["URL"],
    now: sequenceClock(
      REQUEST_STARTED_AT,
      RESPONSE_RECEIVED_AT,
      EVALUATED_AT,
    ),
  });
  const result = projectClarityLiveFrictionRatesV1(runner);

  assert.equal(result.state, "READY_FOR_BEHAVIOR_REVIEW");
  assert.deepEqual(result.coverage.dimensions, ["URL"]);
  assert.deepEqual(
    result.observations.map((observation) => observation.dimensions.URL),
    Array(6).fill("/checkout"),
  );
});

test("fails closed when source truth is partial even though HTTP transport succeeded", async () => {
  const runner = await liveRun(completeResponse(), {
    sourceTruth: "PARTIAL",
    now: sequenceClock(
      REQUEST_STARTED_AT,
      RESPONSE_RECEIVED_AT,
      EVALUATED_AT,
    ),
  });
  const result = projectClarityLiveFrictionRatesV1(runner);

  assert.equal(result.state, "WITHHELD");
  assert.deepEqual(result.reasonCodes, ["SOURCE_NOT_COMPLETE"]);
  assert.deepEqual(result.observations, []);
  assert.equal(result.coverage.sourceTruth, "PARTIAL");
});

test("fails closed when any documented friction metric block is absent instead of treating absence as zero", async () => {
  const payload = completeResponse().filter(
    (block) =>
      !(
        typeof block === "object" &&
        block !== null &&
        "metricName" in block &&
        block.metricName === "Quickback Click"
      ),
  );
  const result = projectClarityLiveFrictionRatesV1(await liveRun(payload));

  assert.equal(result.state, "WITHHELD");
  assert.deepEqual(result.reasonCodes, ["FRICTION_METRIC_MISSING"]);
  assert.deepEqual(result.observations, []);
});

test("fails closed on malformed or internally inconsistent provider percentage rows", async () => {
  const payload = completeResponse();
  const deadClick = payload.find(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      "metricName" in block &&
      block.metricName === "Dead Click Count",
  ) as { information: Array<Record<string, unknown>> };
  deadClick.information[0].sessionsWithMetricPercentage = 11;
  deadClick.information[0].sessionsWithoutMetricPercentage = 70;

  const result = projectClarityLiveFrictionRatesV1(await liveRun(payload));

  assert.equal(result.state, "WITHHELD");
  assert.deepEqual(result.reasonCodes, ["FRICTION_ROW_INVALID"]);
  assert.deepEqual(result.observations, []);
});

test("fails closed when a requested dimension is absent from a friction row", async () => {
  const payload = completeResponse({ URL: "/checkout" });
  const rageClick = payload.find(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      "metricName" in block &&
      block.metricName === "Rage Click Count",
  ) as { information: Array<Record<string, unknown>> };
  delete rageClick.information[0].URL;

  const runner = await liveRun(payload, {
    dimensions: ["URL"],
    now: sequenceClock(
      REQUEST_STARTED_AT,
      RESPONSE_RECEIVED_AT,
      EVALUATED_AT,
    ),
  });
  const result = projectClarityLiveFrictionRatesV1(runner);

  assert.equal(result.state, "WITHHELD");
  assert.deepEqual(result.reasonCodes, ["FRICTION_DIMENSION_MISSING"]);
});

test("rejects duplicate friction blocks and duplicate segment identities", async () => {
  const duplicatedBlockPayload = completeResponse();
  duplicatedBlockPayload.push(frictionBlock("Dead Click Count", 9));
  const duplicatedBlock = projectClarityLiveFrictionRatesV1(
    await liveRun(duplicatedBlockPayload),
  );
  assert.equal(duplicatedBlock.state, "WITHHELD");
  assert.deepEqual(duplicatedBlock.reasonCodes, ["FRICTION_METRIC_DUPLICATED"]);

  const duplicatedRowPayload = completeResponse({ Device: "Mobile" });
  const errorClick = duplicatedRowPayload.find(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      "metricName" in block &&
      block.metricName === "Error Click Count",
  ) as { information: Array<Record<string, unknown>> };
  errorClick.information.push({ ...errorClick.information[0] });

  const duplicatedRow = projectClarityLiveFrictionRatesV1(
    await liveRun(duplicatedRowPayload, {
      dimensions: ["Device"],
      now: sequenceClock(
        REQUEST_STARTED_AT,
        RESPONSE_RECEIVED_AT,
        EVALUATED_AT,
      ),
    }),
  );
  assert.equal(duplicatedRow.state, "WITHHELD");
  assert.deepEqual(duplicatedRow.reasonCodes, ["FRICTION_ROW_DUPLICATED"]);
});

test("is deterministic and deeply immutable", async () => {
  const runner = await liveRun(completeResponse());
  const first = projectClarityLiveFrictionRatesV1(runner);
  const second = projectClarityLiveFrictionRatesV1(runner);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.coverage), true);
  assert.equal(Object.isFrozen(first.observations), true);
  assert.equal(Object.isFrozen(first.observations[0]), true);
  assert.equal(Object.isFrozen(first.observations[0].dimensions), true);
  assert.equal(Object.isFrozen(first.limitations), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
