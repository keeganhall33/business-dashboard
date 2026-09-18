import assert from "node:assert/strict";
import test from "node:test";

import type { RevenueDecisionPacketInputV1 } from "../../../src/lib/intelligence/production-revenue-loop/decision-packet-v1";
import {
  buildFreshRevenueDecisionV1,
  type FreshRevenueDecisionInputV1,
} from "../../../src/lib/intelligence/production-revenue-loop/fresh-revenue-decision-v1";

const currentRange = { startDate: "2026-08-09", endDate: "2026-09-07" };
const comparisonRange = { startDate: "2026-07-10", endDate: "2026-08-08" };

function revenueInput(
  overrides: Partial<RevenueDecisionPacketInputV1> = {},
): RevenueDecisionPacketInputV1 {
  return {
    generatedAt: "2026-09-08T10:00:00Z",
    currentRange,
    comparisonRange,
    observations: [
      {
        source: "WOO",
        truthState: "CURRENT",
        observedAt: "2026-09-08T09:00:00Z",
        current: {
          revenueCents: 80_000,
          orders: 70,
          averageOrderValueCents: 1_143,
          sessions: null,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        previous: {
          revenueCents: 100_000,
          orders: 100,
          averageOrderValueCents: 1_000,
          sessions: null,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        evidenceRefs: ["evidence:woo:current-prior"],
      },
      {
        source: "GA4",
        truthState: "CURRENT",
        observedAt: "2026-09-08T09:05:00Z",
        current: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: 1_000,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        previous: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: 1_000,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        evidenceRefs: ["evidence:ga4:current-prior"],
      },
      {
        source: "META",
        truthState: "CURRENT",
        observedAt: "2026-09-08T09:10:00Z",
        current: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: null,
          spendCents: 20_000,
          attributedPurchaseValueCents: 60_000,
        },
        previous: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: null,
          spendCents: 20_000,
          attributedPurchaseValueCents: 75_000,
        },
        evidenceRefs: ["evidence:meta:current-prior"],
      },
    ],
    ...overrides,
  };
}

function gateInput(
  overrides: Partial<FreshRevenueDecisionInputV1> = {},
): FreshRevenueDecisionInputV1 {
  return {
    revenueInput: revenueInput(),
    evaluatedAt: "2026-09-08T12:00:00Z",
    freshnessPolicy: { WOO: 24, GA4: 24, META: 24 },
    ...overrides,
  };
}

test("builds the canonical revenue decision only after all three sources are fresh", () => {
  const result = buildFreshRevenueDecisionV1(gateInput());

  assert.equal(result.status, "READY");
  assert.equal(result.reasonCode, "FRESH_REVENUE_DECISION_READY");
  assert.equal(result.sourceFreshness.status, "READY");
  assert.equal(result.sourceFreshness.reasonCode, "ALL_SOURCES_CURRENT");
  assert.equal(result.decisionStatus, "READY_FOR_DECISION");
  assert.equal(result.acceptedDecision?.generatedAt, "2026-09-08T12:00:00Z");
  assert.equal(result.acceptedDecision?.primaryDriver.driver, "CONVERSION");
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.expectedLift, null);
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.externalMutationAllowed, false);
  assert.equal(result.metaWriteAllowed, false);
  assert.equal(result.approvalBypassAllowed, false);
});

test("withholds the entire decision when a CURRENT Woo observation has aged beyond policy", () => {
  const input = revenueInput();
  input.observations[0] = { ...input.observations[0], observedAt: "2026-09-07T08:00:00Z" };
  const result = buildFreshRevenueDecisionV1(gateInput({ revenueInput: input }));

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "SOURCE_FRESHNESS_NOT_READY");
  assert.equal(result.sourceFreshness.reasonCode, "SOURCE_EVIDENCE_NOT_CURRENT");
  assert.equal(result.sourceFreshness.sourceStatus.find((item) => item.source === "WOO")?.decisionTruthState, "STALE");
  assert.equal(result.decisionStatus, null);
  assert.equal(result.acceptedDecision, null);
});

test("future source chronology fails closed as conflicted", () => {
  const input = revenueInput();
  input.observations[2] = { ...input.observations[2], observedAt: "2026-09-08T12:00:01Z" };
  const result = buildFreshRevenueDecisionV1(gateInput({ revenueInput: input }));

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "SOURCE_FRESHNESS_CONFLICTED");
  assert.equal(result.sourceFreshness.reasonCode, "INVALID_REVENUE_INPUT");
  assert.equal(result.acceptedDecision, null);
});

test("never upgrades partial source truth merely because its timestamp is recent", () => {
  const input = revenueInput();
  input.observations[1] = { ...input.observations[1], truthState: "PARTIAL" };
  const result = buildFreshRevenueDecisionV1(gateInput({ revenueInput: input }));

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "SOURCE_FRESHNESS_NOT_READY");
  assert.equal(result.sourceFreshness.sourceStatus.find((item) => item.source === "GA4")?.decisionTruthState, "PARTIAL");
  assert.equal(result.acceptedDecision, null);
});

test("requires an explicit positive freshness limit for every revenue source", () => {
  const result = buildFreshRevenueDecisionV1(
    gateInput({ freshnessPolicy: { WOO: 24, GA4: 24, META: 0 } }),
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "SOURCE_FRESHNESS_NOT_READY");
  assert.equal(result.sourceFreshness.reasonCode, "INVALID_FRESHNESS_POLICY");
  assert.equal(result.acceptedDecision, null);
});

test("fresh timestamps do not upgrade a decision with insufficient revenue evidence", () => {
  const input = revenueInput();
  input.observations[0] = {
    ...input.observations[0],
    current: { ...input.observations[0].current, revenueCents: null },
    previous: { ...input.observations[0].previous, revenueCents: null },
  };
  const result = buildFreshRevenueDecisionV1(gateInput({ revenueInput: input }));

  assert.equal(result.sourceFreshness.status, "READY");
  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "REVENUE_DECISION_NOT_READY");
  assert.equal(result.decisionStatus, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.acceptedDecision, null);
});

test("rebuilds at the explicit evaluation instant without mutating the caller input", () => {
  const input = gateInput({ evaluatedAt: "2026-09-08T18:00:00Z" });
  const before = JSON.stringify(input);
  const result = buildFreshRevenueDecisionV1(input);

  assert.equal(result.status, "READY");
  assert.equal(result.evaluatedAt, "2026-09-08T18:00:00Z");
  assert.equal(result.acceptedDecision?.generatedAt, "2026-09-08T18:00:00Z");
  assert.equal(JSON.stringify(input), before);
});
