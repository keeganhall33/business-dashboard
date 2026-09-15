import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeClarityBehaviorV1,
  type ClarityBehaviorPeriodV1,
  type ClarityMetricNameV1,
  type ClaritySourceStateV1
} from "../../src/lib/website-conversion/clarity-behavior-normalizer-v1";

function metric(name: ClarityMetricNameV1, value: number | null, sourceState: ClaritySourceStateV1 = "AVAILABLE") {
  return { name, value, sourceState, evidenceRef: `metric:${name}` } as const;
}

function period(overrides: Partial<ClarityBehaviorPeriodV1> = {}): ClarityBehaviorPeriodV1 {
  return {
    periodId: "current",
    metrics: [metric("SESSIONS", 100), metric("ACTIVE_TIME_SECONDS", 40), metric("DEAD_CLICKS", 5), metric("QUICK_BACKS", 5)],
    events: [],
    ...overrides
  };
}

test("deduplicates overlapping aliases from one source observation", () => {
  const result = normalizeClarityBehaviorV1({
    current: period({
      events: [
        { sourceObservationId: "obs-1", eventName: "Add to cart", count: 12, sourceState: "AVAILABLE", evidenceRef: "event:a" },
        { sourceObservationId: "obs-1", eventName: "kh_add_to_cart", count: 12, sourceState: "AVAILABLE", evidenceRef: "event:b" },
        { sourceObservationId: "obs-2", eventName: "Begin checkout", count: 7, sourceState: "AVAILABLE", evidenceRef: "event:c" },
        { sourceObservationId: "obs-2", eventName: "kh_checkout_entry", count: 7, sourceState: "AVAILABLE", evidenceRef: "event:d" }
      ]
    })
  });
  assert.equal(result.funnel.find((entry) => entry.stage === "ADD_TO_CART")?.count, 12);
  assert.equal(result.funnel.find((entry) => entry.stage === "CHECKOUT")?.count, 7);
});

test("keeps canonical funnel ordering and sums distinct observations", () => {
  const result = normalizeClarityBehaviorV1({
    current: period({ events: [
      { sourceObservationId: "purchase", eventName: "purchase", count: 2, sourceState: "AVAILABLE", evidenceRef: "purchase" },
      { sourceObservationId: "cart-a", eventName: "add_to_cart", count: 3, sourceState: "AVAILABLE", evidenceRef: "cart-a" },
      { sourceObservationId: "cart-b", eventName: "kh_add_to_cart", count: 4, sourceState: "AVAILABLE", evidenceRef: "cart-b" }
    ] })
  });
  assert.deepEqual(result.funnel.map((entry) => entry.stage), ["PAGE_VIEW", "PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT", "PURCHASE"]);
  assert.equal(result.funnel[2].count, 7);
});

test("preserves missing unavailable partial and stale states without zero coercion", () => {
  const result = normalizeClarityBehaviorV1({ current: period({ metrics: [
    metric("SESSIONS", null, "UNAVAILABLE"),
    metric("USERS", 8, "PARTIAL"),
    metric("ACTIVE_TIME_SECONDS", 30, "STALE")
  ] }) });
  assert.deepEqual(result.metrics.SESSIONS, { value: null, sourceState: "UNAVAILABLE", evidenceRefs: ["metric:SESSIONS"] });
  assert.equal(result.metrics.USERS.sourceState, "PARTIAL");
  assert.equal(result.metrics.ACTIVE_TIME_SECONDS.sourceState, "STALE");
  assert.equal(result.metrics.DEAD_CLICKS.sourceState, "UNKNOWN");
  assert.equal(result.metrics.DEAD_CLICKS.value, null);
});

test("calculates safe deltas and leaves a zero denominator unknown", () => {
  const result = normalizeClarityBehaviorV1({
    current: period({ metrics: [metric("SESSIONS", 150), metric("USERS", 5)] }),
    prior: period({ periodId: "prior", metrics: [metric("SESSIONS", 100), metric("USERS", 0)] })
  });
  assert.equal(result.deltas.SESSIONS.percentChange, 50);
  assert.equal(result.deltas.USERS.absoluteChange, 5);
  assert.equal(result.deltas.USERS.percentChange, null);
});

test("does not compare stale or unavailable periods", () => {
  const result = normalizeClarityBehaviorV1({
    current: period({ metrics: [metric("SESSIONS", 100, "STALE")] }),
    prior: period({ periodId: "prior", metrics: [metric("SESSIONS", 50)] })
  });
  assert.equal(result.deltas.SESSIONS.comparable, false);
  assert.equal(result.deltas.SESSIONS.percentChange, null);
});

test("classifies required friction thresholds and deterministic severity", () => {
  const result = normalizeClarityBehaviorV1({
    current: period({ metrics: [metric("SESSIONS", 100), metric("DEAD_CLICKS", 11), metric("QUICK_BACKS", 13), metric("ACTIVE_TIME_SECONDS", 70)] }),
    prior: period({ periodId: "prior", metrics: [metric("SESSIONS", 100), metric("DEAD_CLICKS", 5), metric("ACTIVE_TIME_SECONDS", 100)] })
  });
  assert.deepEqual(result.findings.map((finding) => finding.reasonCode), [
    "DEAD_CLICK_RATE",
    "ACTIVE_TIME_REGRESSION",
    "DEAD_CLICK_DOUBLING",
    "QUICK_BACK_RATE"
  ]);
  assert.equal(result.findings[0].severity, "CRITICAL");
});

test("threshold equality does not trigger strict dead-click or quick-back findings", () => {
  const result = normalizeClarityBehaviorV1({ current: period({ metrics: [
    metric("SESSIONS", 100), metric("DEAD_CLICKS", 10), metric("QUICK_BACKS", 12)
  ] }) });
  assert.equal(result.findings.length, 0);
});

test("preserves and deterministically orders segment dimensions", () => {
  const event = (sourceObservationId: string, segment: Record<string, string>) => ({
    sourceObservationId, eventName: "page_view", count: 1, sourceState: "AVAILABLE" as const, evidenceRef: sourceObservationId, segment
  });
  const left = normalizeClarityBehaviorV1({ current: period({ events: [event("b", { device: "mobile", country: "US" }), event("a", { country: "CA" })] }) });
  const right = normalizeClarityBehaviorV1({ current: period({ events: [event("a", { country: "CA" }), event("b", { country: "US", device: "mobile" })] }) });
  assert.deepEqual(left.segments, right.segments);
  assert.deepEqual(left.segments, [{ country: "CA" }, { country: "US", device: "mobile" }]);
});

test("finding output is deterministically capped", () => {
  const result = normalizeClarityBehaviorV1({
    current: period({ metrics: [metric("SESSIONS", 100), metric("DEAD_CLICKS", 20), metric("QUICK_BACKS", 20)] }),
    findingLimit: 1
  });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].reasonCode, "DEAD_CLICK_RATE");
});

test("rejects malformed and unbounded values", () => {
  assert.throws(() => normalizeClarityBehaviorV1({ current: period({ metrics: [metric("SCROLL_DEPTH_PERCENT", 101)] }) }), /bounded number/);
  assert.throws(() => normalizeClarityBehaviorV1({ current: period({ events: [{ sourceObservationId: "x", eventName: "purchase", count: 1.5, sourceState: "AVAILABLE", evidenceRef: "x" }] }) }), /integer/);
  assert.throws(() => normalizeClarityBehaviorV1({ current: period({ metrics: [metric("SESSIONS", 1), metric("SESSIONS", 2)] }) }), /duplicated/);
});

test("is immutable, deterministic, and performs no external access or writes", () => {
  const input = { current: period() };
  const before = JSON.stringify(input);
  const first = normalizeClarityBehaviorV1(input);
  const second = normalizeClarityBehaviorV1(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.metrics.SESSIONS), true);
  assert.equal(first.externalAccessPerformed, false);
  assert.equal(first.writesPerformed, false);
});
