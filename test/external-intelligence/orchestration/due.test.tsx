import test from "node:test";
import assert from "node:assert/strict";

import { computeNextDueUtc, isDueUtc } from "@/lib/external-intelligence/orchestration/due";

test("due: hourly cadence advances to next UTC hour", () => {
  const next = computeNextDueUtc({ now_iso: "2026-08-05T10:15:30.000Z", cadence: { type: "hourly" } });
  assert.equal(next, "2026-08-05T11:00:00.000Z");
});

test("due: daily cadence advances to next UTC day boundary", () => {
  const next = computeNextDueUtc({ now_iso: "2026-08-05T23:59:59.000Z", cadence: { type: "daily" } });
  assert.equal(next, "2026-08-06T00:00:00.000Z");
});

test("due: same-hour duplicate is not due when next_run_at is in the future", () => {
  assert.equal(isDueUtc({ now_iso: "2026-08-05T10:10:00.000Z", next_run_at: "2026-08-05T11:00:00.000Z" }), false);
});

test("due: next hour becomes due", () => {
  assert.equal(isDueUtc({ now_iso: "2026-08-05T11:00:00.000Z", next_run_at: "2026-08-05T11:00:00.000Z" }), true);
});

test("due: DST does not affect UTC schedule boundaries", () => {
  // US DST spring-forward day: UTC cadence must remain deterministic.
  const next = computeNextDueUtc({ now_iso: "2026-03-08T09:30:00.000Z", cadence: { type: "hourly" } });
  assert.equal(next, "2026-03-08T10:00:00.000Z");
});
