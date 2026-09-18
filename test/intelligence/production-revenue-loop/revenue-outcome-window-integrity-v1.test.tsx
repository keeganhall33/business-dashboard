import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRevenueOutcomeWithWindowIntegrityV1,
} from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-window-integrity-v1";
import type {
  RevenueOutcomeEvaluationInputV1,
  RevenueOutcomeObservationV1,
} from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-evaluation-v1";

function observation(
  source: RevenueOutcomeObservationV1["source"],
  metric: string,
  value: number | null,
  side: "baseline" | "outcome",
  overrides: Partial<RevenueOutcomeObservationV1> = {},
): RevenueOutcomeObservationV1 {
  const range = side === "baseline"
    ? { startDate: "2026-08-01", endDate: "2026-08-14" }
    : { startDate: "2026-08-16", endDate: "2026-08-29" };
  return {
    source,
    metric,
    unit: "COUNT",
    value,
    truthState: "CURRENT",
    range,
    completeThrough: range.endDate,
    observedAt: side === "baseline" ? "2026-08-15T12:00:00.000Z" : "2026-08-30T12:00:00.000Z",
    evidenceRefs: [`${source.toLowerCase()}:${metric}:${side}`],
    ...overrides,
  };
}

function input(
  overrides: Partial<RevenueOutcomeEvaluationInputV1> = {},
): RevenueOutcomeEvaluationInputV1 {
  return {
    decisionRef: "revenue-action:abc12345",
    implementationRef: "action-execution:abc12345",
    implementedAt: "2026-08-15T18:00:00.000Z",
    evaluatedAt: "2026-08-31T12:00:00.000Z",
    implementationEvidenceRefs: ["action:audit:implemented"],
    baseline: [
      observation("WOO", "orders", 100, "baseline"),
      observation("GA4", "sessions", 1_000, "baseline"),
      observation("META", "spend", 40_000, "baseline", { unit: "CENTS" }),
    ],
    outcome: [
      observation("WOO", "orders", 112, "outcome"),
      observation("GA4", "sessions", 1_080, "outcome"),
      observation("META", "spend", 40_000, "outcome", { unit: "CENTS" }),
    ],
    ...overrides,
  };
}

test("allows aligned closed multisource windows without adding causality or execution authority", () => {
  const result = evaluateRevenueOutcomeWithWindowIntegrityV1(input());

  assert.equal(result.status, "EVALUATED");
  assert.equal(result.reasonCode, "WINDOW_INTEGRITY_CONFIRMED");
  assert.equal(result.upstreamStatus, "MEASURED");
  assert.ok(result.evaluation);
  assert.equal(result.evaluation.causalAttribution, "NOT_ESTABLISHED");
  assert.deepEqual(result.canonicalWindows, {
    baseline: { startDate: "2026-08-01", endDate: "2026-08-14" },
    outcome: { startDate: "2026-08-16", endDate: "2026-08-29" },
  });
  assert.deepEqual(result.authority, {
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  });
  assert.match(result.limitations.join(" "), /do not establish/i);
  assert.match(result.limitations.join(" "), /No source movement is attributed/i);
});

test("blocks mixed baseline ranges across WooCommerce, GA4, and Meta", () => {
  const result = evaluateRevenueOutcomeWithWindowIntegrityV1(input({
    baseline: [
      observation("WOO", "orders", 100, "baseline"),
      observation("GA4", "sessions", 1_000, "baseline", {
        range: { startDate: "2026-07-31", endDate: "2026-08-13" },
        completeThrough: "2026-08-13",
        observedAt: "2026-08-14T12:00:00.000Z",
      }),
      observation("META", "spend", 40_000, "baseline", { unit: "CENTS" }),
    ],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "BASELINE_RANGE_MISMATCH_ACROSS_SOURCES");
  assert.equal(result.upstreamStatus, "MEASURED");
  assert.equal(result.evaluation, null);
});

test("blocks mixed outcome ranges across sources instead of treating them as one post period", () => {
  const result = evaluateRevenueOutcomeWithWindowIntegrityV1(input({
    outcome: [
      observation("WOO", "orders", 112, "outcome"),
      observation("GA4", "sessions", 1_080, "outcome", {
        range: { startDate: "2026-08-17", endDate: "2026-08-30" },
        completeThrough: "2026-08-30",
        observedAt: "2026-08-31T06:00:00.000Z",
      }),
      observation("META", "spend", 40_000, "outcome", { unit: "CENTS" }),
    ],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "OUTCOME_RANGE_MISMATCH_ACROSS_SOURCES");
  assert.equal(result.upstreamStatus, "MEASURED");
  assert.equal(result.evaluation, null);
});

test("refuses an evaluation-day measurement window even when upstream arithmetic can be computed", () => {
  const sameDayOutcome = observation("WOO", "orders", 112, "outcome", {
    range: { startDate: "2026-08-16", endDate: "2026-08-29" },
    completeThrough: "2026-08-29",
    observedAt: "2026-08-29T23:00:00.000Z",
  });
  const result = evaluateRevenueOutcomeWithWindowIntegrityV1(input({
    evaluatedAt: "2026-08-29T23:59:00.000Z",
    baseline: [observation("WOO", "orders", 100, "baseline")],
    outcome: [sameDayOutcome],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "MEASUREMENT_WINDOW_NOT_CLOSED");
  assert.equal(result.upstreamStatus, "MEASURED");
  assert.equal(result.evaluation, null);
});

test("refuses completeness claims that reach the evaluation day or future", () => {
  const result = evaluateRevenueOutcomeWithWindowIntegrityV1(input({
    baseline: [observation("WOO", "orders", 100, "baseline")],
    outcome: [observation("WOO", "orders", 112, "outcome", {
      completeThrough: "2026-09-01",
    })],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "FUTURE_COVERAGE_CLAIM");
  assert.equal(result.upstreamStatus, "MEASURED");
  assert.equal(result.evaluation, null);
});

test("refuses daily post measurements that mix implementation-day pre and post hours", () => {
  const result = evaluateRevenueOutcomeWithWindowIntegrityV1(input({
    baseline: [observation("WOO", "orders", 100, "baseline")],
    outcome: [observation("WOO", "orders", 112, "outcome", {
      range: { startDate: "2026-08-15", endDate: "2026-08-28" },
      completeThrough: "2026-08-28",
      observedAt: "2026-08-29T12:00:00.000Z",
    })],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "IMPLEMENTATION_DAY_MIXED_INTO_OUTCOME");
  assert.equal(result.upstreamStatus, "MEASURED");
  assert.equal(result.evaluation, null);
});

test("keeps non-current upstream evidence blocked and never exposes it as a measured evaluation", () => {
  const result = evaluateRevenueOutcomeWithWindowIntegrityV1(input({
    baseline: [observation("WOO", "orders", 100, "baseline")],
    outcome: [observation("WOO", "orders", 112, "outcome", {
      truthState: "PARTIAL",
    })],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "UPSTREAM_EVALUATION_NOT_MEASURED");
  assert.equal(result.upstreamStatus, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.evaluation, null);
  assert.ok(result.upstreamReasonCodes.includes("SOURCE_EVIDENCE_NOT_CURRENT"));
});

test("is deterministic, immutable, and leaves caller input unchanged", () => {
  const value = input();
  const before = structuredClone(value);
  const first = evaluateRevenueOutcomeWithWindowIntegrityV1(value);
  const second = evaluateRevenueOutcomeWithWindowIntegrityV1(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.canonicalWindows), true);
  assert.equal(Object.isFrozen(first.authority), true);
  assert.equal(Object.isFrozen(first.evaluation), true);
});
