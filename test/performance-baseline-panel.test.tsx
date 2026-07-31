import test from "node:test";
import assert from "node:assert/strict";
import { formatPerformanceBaselineDelta, formatPerformanceBaselineValue } from "../src/components/dashboard/PerformanceBaselinePanel";
import type { PerformanceBaselineMetric } from "../src/lib/types/dashboard";

test("percent deltas render as percentage points with relative percent in parentheses", () => {
  const metric: PerformanceBaselineMetric = {
    id: "purchase_conversion_rate",
    unit: "percent",
    current: 4,
    previous: 2,
    delta: 2,
    deltaPercent: 1
  };

  assert.equal(formatPerformanceBaselineValue(metric), "4.0%", "current value should format as percent");
  assert.equal(formatPerformanceBaselineDelta(metric), "+2.0 pp (+100.0%)");
});

test("percent delta negative shows pp + negative relative percent", () => {
  const metric: PerformanceBaselineMetric = {
    id: "purchase_conversion_rate",
    unit: "percent",
    current: 2,
    previous: 4,
    delta: -2,
    deltaPercent: -0.5
  };

  assert.equal(formatPerformanceBaselineDelta(metric), "-2.0 pp (-50.0%)");
});

test("previous zero shows absolute pp with no relative percent", () => {
  const metric: PerformanceBaselineMetric = {
    id: "purchase_conversion_rate",
    unit: "percent",
    current: 2,
    previous: 0,
    delta: 2,
    deltaPercent: null
  };

  assert.equal(formatPerformanceBaselineDelta(metric), "+2.0 pp");
});

test("zero-to-zero renders neutral 0.0 pp", () => {
  const metric: PerformanceBaselineMetric = {
    id: "purchase_conversion_rate",
    unit: "percent",
    current: 0,
    previous: 0,
    delta: 0,
    deltaPercent: null
  };

  assert.equal(formatPerformanceBaselineDelta(metric), "0.0 pp");
});

test("negative zero is normalized in display", () => {
  const metric: PerformanceBaselineMetric = {
    id: "purchase_conversion_rate",
    unit: "percent",
    current: -0,
    previous: 0,
    delta: -0,
    deltaPercent: -0
  };

  const value = formatPerformanceBaselineValue(metric);
  const delta = formatPerformanceBaselineDelta(metric);
  assert.ok(!value.includes("-0"));
  assert.ok(!delta.includes("-0"));
});

test("currency and count metrics do not display pp", () => {
  const revenue: PerformanceBaselineMetric = {
    id: "revenue",
    unit: "currency",
    current: 100,
    previous: 50,
    delta: 50,
    deltaPercent: 1
  };
  const orders: PerformanceBaselineMetric = {
    id: "orders",
    unit: "count",
    current: 10,
    previous: 5,
    delta: 5,
    deltaPercent: 1
  };

  assert.ok(!formatPerformanceBaselineDelta(revenue).includes("pp"));
  assert.ok(!formatPerformanceBaselineDelta(orders).includes("pp"));
});

test("partial commerce values are labeled as At least and do not show exact deltas", () => {
  const revenue: PerformanceBaselineMetric = {
    id: "revenue",
    unit: "currency",
    current: 0.14,
    previous: 6,
    delta: null,
    deltaPercent: null,
    currentQualifier: "at_least",
    currentCompleteness: "partial",
    previousCompleteness: "complete"
  };

  assert.equal(formatPerformanceBaselineValue(revenue), "At least $0.14");
  assert.equal(formatPerformanceBaselineDelta(revenue), "Comparison unavailable · Historical coverage incomplete");
});

test("unavailable metrics render safely", () => {
  const metric: PerformanceBaselineMetric = {
    id: "sessions",
    unit: "count",
    current: null,
    previous: 10,
    delta: null,
    deltaPercent: null
  };

  assert.equal(formatPerformanceBaselineValue(metric), "Unavailable");
  assert.equal(formatPerformanceBaselineDelta(metric), "Unavailable");
});
