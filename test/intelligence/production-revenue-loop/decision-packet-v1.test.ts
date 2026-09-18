import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRevenueDecisionPacketV1,
  type RevenueDecisionPacketInputV1,
  type RevenueMetricsV1,
  type RevenueSourceObservationV1
} from "@/lib/intelligence/production-revenue-loop/decision-packet-v1";

const metrics = (overrides: Partial<RevenueMetricsV1> = {}): RevenueMetricsV1 => ({
  revenueCents: null,
  orders: null,
  averageOrderValueCents: null,
  sessions: null,
  spendCents: null,
  attributedPurchaseValueCents: null,
  ...overrides
});

const observation = (
  source: RevenueSourceObservationV1["source"],
  current: Partial<RevenueMetricsV1>,
  previous: Partial<RevenueMetricsV1>,
  overrides: Partial<RevenueSourceObservationV1> = {}
): RevenueSourceObservationV1 => ({
  source,
  truthState: "CURRENT",
  observedAt: "2026-09-13T20:00:00.000Z",
  current: metrics(current),
  previous: metrics(previous),
  evidenceRefs: [`${source.toLowerCase()}:matched-period`],
  ...overrides
});

const input = (overrides: Partial<RevenueDecisionPacketInputV1> = {}): RevenueDecisionPacketInputV1 => ({
  generatedAt: "2026-09-13T23:00:00.000Z",
  currentRange: { startDate: "2026-08-14", endDate: "2026-09-12" },
  comparisonRange: { startDate: "2026-07-15", endDate: "2026-08-13" },
  observations: [
    observation("WOO", { revenueCents: 120_000, orders: 100, averageOrderValueCents: 1_200 }, { revenueCents: 100_000, orders: 100, averageOrderValueCents: 1_000 }),
    observation("GA4", { sessions: 1_000 }, { sessions: 1_000 }),
    observation("META", { spendCents: 30_000, attributedPurchaseValueCents: 60_000 }, { spendCents: 30_000, attributedPurchaseValueCents: 50_000 })
  ],
  ...overrides
});

test("builds one bounded approval-gated decision with baseline and evaluation window", () => {
  const result = buildRevenueDecisionPacketV1(input());
  assert.equal(result.status, "READY_FOR_DECISION");
  assert.equal(result.primaryDriver.driver, "ORDER_VALUE");
  assert.equal(result.primaryDriver.state, "SUPPORTED");
  assert.match(result.primaryDriver.statement, /not a proven cause/);
  assert.equal(result.recommendedAction.approvalClass, "KEEGAN_APPROVAL_REQUIRED");
  assert.equal(result.recommendedAction.executesMutation, false);
  assert.equal(result.measurement.baseline, 1_200);
  assert.deepEqual(result.measurement.evaluationWindow, { startDate: "2026-09-13", endDate: "2026-09-26" });
  assert.equal(result.outcomeState, "IMPLEMENTED_NEEDS_OUTCOME");
});

test("withholds a driver and consequential action when source coverage is incomplete", () => {
  const observations = input().observations.map((item) => item.source === "META" ? { ...item, truthState: "STALE" as const } : item);
  const result = buildRevenueDecisionPacketV1(input({ observations }));
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.primaryDriver.state, "UNKNOWN");
  assert.equal(result.recommendedAction.approvalClass, "AUTO_CONTINUE");
  assert.match(result.recommendedAction.description, /Reconcile/);
  assert.deepEqual(result.limitations, ["META coverage is STALE."]);
});

test("preserves explicit source conflicts", () => {
  const observations = input().observations.map((item) => item.source === "GA4" ? { ...item, truthState: "CONFLICTED" as const } : item);
  const result = buildRevenueDecisionPacketV1(input({ observations }));
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.conflictingEvidence, ["GA4 evidence is conflicted."]);
  assert.equal(result.primaryDriver.driver, null);
});

test("keeps a zero baseline UNKNOWN instead of fabricating percentage or causality", () => {
  const observations = input().observations.map((item) => item.source === "WOO"
    ? observation("WOO", { revenueCents: 10_000, orders: 2, averageOrderValueCents: 5_000 }, { revenueCents: 0, orders: 0, averageOrderValueCents: 0 })
    : item);
  const result = buildRevenueDecisionPacketV1(input({ observations }));
  assert.equal(result.whatChanged.percentChange, null);
  assert.equal(result.primaryDriver.driver, null);
  assert.equal(result.reasonCode, "DRIVER_NOT_ISOLATED");
});

test("does not treat Meta attribution context as proof of causality or profit", () => {
  const result = buildRevenueDecisionPacketV1(input());
  assert.ok(result.alternativeHypotheses.length > 0);
  assert.ok(result.corroboratingEvidence.some((item) => item.includes("not treated as causal attribution")));
  assert.doesNotMatch(JSON.stringify(result), /profitCents|cash/);
});

test("requires a clear distinct contributor before selecting a driver", () => {
  const observations = [
    observation("WOO", { revenueCents: 120_000, orders: 120, averageOrderValueCents: 1_000 }, { revenueCents: 100_000, orders: 100, averageOrderValueCents: 1_000 }),
    observation("GA4", { sessions: 1_200 }, { sessions: 1_000 }),
    observation("META", { spendCents: 30_000 }, { spendCents: 30_000 })
  ];
  const result = buildRevenueDecisionPacketV1(input({ observations }));
  assert.equal(result.primaryDriver.driver, null);
  assert.equal(result.primaryDriver.confidence, "LOW");
});

test("rejects non-adjacent, non-30-day, duplicate, negative, and unbounded evidence inputs", () => {
  assert.equal(buildRevenueDecisionPacketV1(input({ currentRange: { startDate: "2026-09-01", endDate: "2026-09-12" } })).status, "INVALID_INPUT");
  assert.equal(buildRevenueDecisionPacketV1(input({ comparisonRange: { startDate: "2026-07-14", endDate: "2026-08-12" } })).status, "INVALID_INPUT");
  assert.equal(buildRevenueDecisionPacketV1(input({ observations: [input().observations[0], input().observations[0]] })).status, "INVALID_INPUT");
  assert.equal(buildRevenueDecisionPacketV1(input({ observations: [observation("WOO", { revenueCents: -1 }, { revenueCents: 1 })] })).status, "INVALID_INPUT");
  assert.equal(buildRevenueDecisionPacketV1(input({ observations: [observation("WOO", {}, {}, { evidenceRefs: Array.from({ length: 11 }, (_, index) => `e:${index}`) })] })).status, "INVALID_INPUT");
});

test("fails closed on unanchored CURRENT, future-dated, and impossible calendar evidence", () => {
  const unanchored = input().observations.map((item) => item.source === "WOO"
    ? { ...item, evidenceRefs: [] }
    : item);
  assert.equal(buildRevenueDecisionPacketV1(input({ observations: unanchored })).status, "INVALID_INPUT");

  const futureDated = input().observations.map((item) => item.source === "GA4"
    ? { ...item, observedAt: "2026-09-14T00:00:00.000Z" }
    : item);
  assert.equal(buildRevenueDecisionPacketV1(input({ observations: futureDated })).status, "INVALID_INPUT");

  assert.equal(buildRevenueDecisionPacketV1(input({
    currentRange: { startDate: "2026-02-30", endDate: "2026-03-31" },
    comparisonRange: { startDate: "2026-01-31", endDate: "2026-03-01" }
  })).status, "INVALID_INPUT");
});

test("is deterministic, sorts evidence, freezes output, and does not mutate input", () => {
  const value = input();
  value.observations[0].evidenceRefs = ["woo:z", "woo:a"];
  const before = structuredClone(value);
  const first = buildRevenueDecisionPacketV1(value);
  const second = buildRevenueDecisionPacketV1(structuredClone(value));
  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.deepEqual(first.sourceCoverage[0].evidenceRefs, ["woo:a", "woo:z"]);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.sourceCoverage));
  assert.ok(Object.isFrozen(first.recommendedAction));
});
