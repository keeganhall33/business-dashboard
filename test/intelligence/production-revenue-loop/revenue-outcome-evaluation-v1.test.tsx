import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRevenueOutcomeV1,
  type RevenueOutcomeEvaluationInputV1,
  type RevenueOutcomeObservationV1,
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

function input(overrides: Partial<RevenueOutcomeEvaluationInputV1> = {}): RevenueOutcomeEvaluationInputV1 {
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

test("measures directly observed matched changes without claiming causality or execution authority", () => {
  const result = evaluateRevenueOutcomeV1(input());

  assert.equal(result.status, "MEASURED");
  assert.equal(result.causalAttribution, "NOT_ESTABLISHED");
  assert.match(result.interpretation, /not causal attribution/i);
  assert.equal(result.comparisons.length, 3);

  const orders = result.comparisons.find((item) => item.source === "WOO" && item.metric === "orders");
  assert.ok(orders);
  assert.equal(orders.baselineValue, 100);
  assert.equal(orders.outcomeValue, 112);
  assert.equal(orders.absoluteChange, 12);
  assert.equal(orders.relativeChangeRatio, 0.12);
  assert.equal(orders.direction, "UP");

  assert.deepEqual(result.authority, {
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  });
  assert.ok(result.evidenceRefs.includes("action:audit:implemented"));
});

test("evaluates only an explicitly supplied structured success criterion", () => {
  const result = evaluateRevenueOutcomeV1(input({
    successRule: {
      source: "WOO",
      metric: "orders",
      unit: "COUNT",
      comparator: "AT_LEAST_RELATIVE_CHANGE",
      threshold: 0.1,
      evidenceRef: "decision:success-rule:orders-10pct",
    },
  }));

  assert.equal(result.status, "MEASURED");
  assert.equal(result.criterion.status, "MET");
  assert.equal(result.criterion.observedValue, 0.12);
  assert.ok(result.reasonCodes.includes("PREDECLARED_CRITERION_MET"));
  assert.equal(result.causalAttribution, "NOT_ESTABLISHED");
});

test("does not manufacture a success judgment when no structured rule exists", () => {
  const result = evaluateRevenueOutcomeV1(input());

  assert.deepEqual(result.criterion, {
    status: "NOT_EVALUATED",
    rule: null,
    observedValue: null,
    evidenceRef: null,
  });
  assert.equal(result.reasonCodes.includes("PREDECLARED_CRITERION_MET"), false);
  assert.equal(result.reasonCodes.includes("PREDECLARED_CRITERION_NOT_MET"), false);
});

test("fails closed when baseline and outcome do not contain the same metric identity", () => {
  const result = evaluateRevenueOutcomeV1(input({
    outcome: [observation("WOO", "orders", 112, "outcome")],
  }));

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.comparisons, []);
  assert.ok(result.reasonCodes.includes("METRIC_PAIR_MISSING"));
});

test("keeps stale, partial, and unknown source evidence out of measured learning", () => {
  for (const truthState of ["STALE", "PARTIAL", "UNKNOWN"] as const) {
    const result = evaluateRevenueOutcomeV1(input({
      outcome: [
        observation("WOO", "orders", 112, "outcome", { truthState }),
        observation("GA4", "sessions", 1_080, "outcome"),
        observation("META", "spend", 40_000, "outcome", { unit: "CENTS" }),
      ],
    }));

    assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
    assert.ok(result.reasonCodes.includes("SOURCE_EVIDENCE_NOT_CURRENT"));
  }
});

test("fails closed on conflicted or duplicate observations", () => {
  const conflicted = evaluateRevenueOutcomeV1(input({
    outcome: [
      observation("WOO", "orders", 112, "outcome", { truthState: "CONFLICTED" }),
      observation("GA4", "sessions", 1_080, "outcome"),
      observation("META", "spend", 40_000, "outcome", { unit: "CENTS" }),
    ],
  }));
  assert.equal(conflicted.status, "CONFLICTED");
  assert.ok(conflicted.reasonCodes.includes("SOURCE_EVIDENCE_CONFLICTED"));

  const duplicate = evaluateRevenueOutcomeV1(input({
    baseline: [
      observation("WOO", "orders", 100, "baseline"),
      observation("WOO", "orders", 101, "baseline", { evidenceRefs: ["woo:orders:competing"] }),
    ],
    outcome: [observation("WOO", "orders", 112, "outcome")],
  }));
  assert.equal(duplicate.status, "CONFLICTED");
  assert.ok(duplicate.reasonCodes.includes("DUPLICATE_METRIC_OBSERVATION"));
});

test("refuses implementation-overlapping, mismatched, or incomplete measurement windows", () => {
  const overlap = evaluateRevenueOutcomeV1(input({
    baseline: [observation("WOO", "orders", 100, "baseline", {
      range: { startDate: "2026-08-02", endDate: "2026-08-15" },
      completeThrough: "2026-08-15",
    })],
    outcome: [observation("WOO", "orders", 112, "outcome")],
  }));
  assert.equal(overlap.status, "CONFLICTED");
  assert.ok(overlap.reasonCodes.includes("IMPLEMENTATION_WINDOW_OVERLAP"));

  const mismatched = evaluateRevenueOutcomeV1(input({
    baseline: [observation("WOO", "orders", 100, "baseline")],
    outcome: [observation("WOO", "orders", 112, "outcome", {
      range: { startDate: "2026-08-16", endDate: "2026-08-30" },
      completeThrough: "2026-08-30",
      observedAt: "2026-08-31T06:00:00.000Z",
    })],
  }));
  assert.equal(mismatched.status, "CONFLICTED");
  assert.ok(mismatched.reasonCodes.includes("COMPARISON_WINDOW_LENGTH_MISMATCH"));

  const incomplete = evaluateRevenueOutcomeV1(input({
    baseline: [observation("WOO", "orders", 100, "baseline")],
    outcome: [observation("WOO", "orders", 112, "outcome", { completeThrough: "2026-08-28" })],
  }));
  assert.equal(incomplete.status, "INSUFFICIENT_EVIDENCE");
  assert.ok(incomplete.reasonCodes.includes("COVERAGE_INCOMPLETE"));
});

test("preserves null metric values as unknown instead of coercing them to zero", () => {
  const result = evaluateRevenueOutcomeV1(input({
    baseline: [observation("WOO", "orders", 100, "baseline")],
    outcome: [observation("WOO", "orders", null, "outcome")],
  }));

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.ok(result.reasonCodes.includes("METRIC_VALUE_UNKNOWN"));
  assert.deepEqual(result.comparisons, []);
});

test("marks explicit current confounders without converting them into causal explanations", () => {
  const result = evaluateRevenueOutcomeV1(input({
    confounders: [{
      label: "A major product launch overlapped the evaluation window.",
      truthState: "CURRENT",
      observedAt: "2026-08-20T12:00:00.000Z",
      evidenceRefs: ["campaign:launch:audit"],
    }],
  }));

  assert.equal(result.status, "MEASURED_WITH_CONFOUNDERS");
  assert.ok(result.reasonCodes.includes("EXPLICIT_CONFOUNDERS_PRESENT"));
  assert.equal(result.causalAttribution, "NOT_ESTABLISHED");
  assert.equal(result.confounders[0]?.label, "A major product launch overlapped the evaluation window.");
  assert.ok(result.evidenceRefs.includes("campaign:launch:audit"));
});

test("does not evaluate a relative criterion when the observed baseline is zero", () => {
  const result = evaluateRevenueOutcomeV1(input({
    baseline: [observation("WOO", "orders", 0, "baseline")],
    outcome: [observation("WOO", "orders", 5, "outcome")],
    successRule: {
      source: "WOO",
      metric: "orders",
      unit: "COUNT",
      comparator: "AT_LEAST_RELATIVE_CHANGE",
      threshold: 0.1,
      evidenceRef: "decision:success-rule:orders-relative",
    },
  }));

  assert.equal(result.status, "MEASURED");
  assert.equal(result.comparisons[0]?.relativeChangeRatio, null);
  assert.equal(result.criterion.status, "NOT_EVALUATED");
  assert.ok(result.reasonCodes.includes("PREDECLARED_CRITERION_NOT_EVALUABLE"));
});

test("is deterministic, immutable, and leaves caller input unchanged", () => {
  const value = input({
    confounders: [{
      label: "Observed inventory change during the outcome window.",
      truthState: "CURRENT",
      observedAt: "2026-08-22T12:00:00.000Z",
      evidenceRefs: ["woo:inventory:audit"],
    }],
  });
  const before = structuredClone(value);
  const first = evaluateRevenueOutcomeV1(value);
  const second = evaluateRevenueOutcomeV1(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.comparisons), true);
  assert.equal(Object.isFrozen(first.comparisons[0]), true);
  assert.equal(Object.isFrozen(first.authority), true);
  assert.match(first.evaluationId, /^revenue-outcome:[0-9a-f]{8}$/);
});
