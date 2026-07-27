import test from "node:test";
import assert from "node:assert/strict";

type ExperimentalMetricLike = {
  currentValue: number | null;
  unit?: string | null;
  measuredAt?: string | null;
  source?: string | null;
  formula?: string | null;
};

function shouldShowExperimentalMetric(metric: ExperimentalMetricLike) {
  const hasValue = metric.currentValue != null;
  const measuredAt = metric.measuredAt;
  const source = metric.source;
  const formula = metric.formula;
  return Boolean(hasValue && measuredAt && source && formula);
}

test("Experimental gating: complete provenance renders", () => {
  assert.equal(
    shouldShowExperimentalMetric({ currentValue: 6.2, unit: null, measuredAt: "2026-07-01", source: "twitter", formula: "(followers_delta / followers_prev)" }),
    true
  );
});

test("Experimental gating: missing source hides", () => {
  assert.equal(shouldShowExperimentalMetric({ currentValue: 6.2, measuredAt: "2026-07-01", formula: "x" }), false);
});

test("Experimental gating: missing formula hides", () => {
  assert.equal(shouldShowExperimentalMetric({ currentValue: 6.2, measuredAt: "2026-07-01", source: "twitter" }), false);
});

test("Experimental gating: missing last update hides", () => {
  assert.equal(shouldShowExperimentalMetric({ currentValue: 6.2, source: "twitter", formula: "x" }), false);
});

test("Experimental gating: missing value hides", () => {
  assert.equal(shouldShowExperimentalMetric({ currentValue: null, measuredAt: "2026-07-01", source: "twitter", formula: "x" }), false);
});
