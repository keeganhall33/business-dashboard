import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRangeSnapshot,
  createAppliedRangeSnapshot,
  createRangeRequestState,
  isCurrentRangeRequest,
  shouldStartRangeRequest
} from "../src/lib/dashboard/range-refresh.ts";

test("shouldStartRangeRequest blocks duplicate fetches", () => {
  const applied = createAppliedRangeSnapshot("30d", "range=30d", 0);
  assert.equal(shouldStartRangeRequest(applied, null, "30d", 0), false);

  const refreshSignal = Date.now();
  assert.equal(shouldStartRangeRequest(applied, null, "30d", refreshSignal), true);
});

test("shouldStartRangeRequest skips when identical request already in flight", () => {
  const applied = createAppliedRangeSnapshot("30d", "range=30d", 0);
  const inFlight = createRangeRequestState("7d", 123);
  assert.equal(shouldStartRangeRequest(applied, inFlight, "7d", 123), false);
  assert.equal(shouldStartRangeRequest(applied, inFlight, "custom:2026-01-01:2026-01-07", 123), true);
});

test("applyRangeSnapshot updates the canonical applied range", () => {
  const applied = createAppliedRangeSnapshot("30d", "range=30d", 0);
  const nextKey = "custom:2026-01-01:2026-01-07";
  const signal = 42;
  const query = "range=custom&start=2026-01-01&end=2026-01-07";
  applyRangeSnapshot(applied, nextKey, signal, query);
  assert.equal(applied.key, nextKey);
  assert.equal(applied.signal, signal);
  assert.equal(applied.queryString, query);
});

test("isCurrentRangeRequest only matches the latest token", () => {
  const first = createRangeRequestState("30d", 1);
  const second = createRangeRequestState("7d", 2);
  assert.equal(isCurrentRangeRequest(first, first.token), true);
  assert.equal(isCurrentRangeRequest(first, second.token), false);
});
