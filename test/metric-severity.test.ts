import test from "node:test";
import assert from "node:assert/strict";

import { deriveMetricSeverity, percentChange } from "../src/lib/metrics/severity.ts";

test("deriveMetricSeverity flags urgent intervention when far below target", () => {
  const severity = deriveMetricSeverity(50, 100, null);
  assert.equal(severity.status, "critical");
  assert.equal(severity.severityLabel, "Urgent intervention");
});

test("deriveMetricSeverity distinguishes abnormal trend movement", () => {
  const severity = deriveMetricSeverity(95, 100, -6);
  assert.equal(severity.status, "warning");
  assert.equal(severity.severityLabel, "Abnormal movement");
});

test("percentChange computes relative difference", () => {
  assert.equal(percentChange(110, 100), 10);
  assert.equal(percentChange(90, 100), -10);
  assert.equal(percentChange(null, 100), null);
});
