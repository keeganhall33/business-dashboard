import assert from "node:assert/strict";
import test from "node:test";

import { buildRevenueDecisionPacketV1, type RevenueDecisionPacketInputV1 } from "../../../src/lib/intelligence/production-revenue-loop/decision-packet-v1";
import {
  revalidateRevenueSourceFreshnessV1,
  type RevenueSourceFreshnessPolicyV1,
} from "../../../src/lib/intelligence/production-revenue-loop/source-freshness-revalidation-v1";

const currentRange = { startDate: "2026-08-09", endDate: "2026-09-07" };
const comparisonRange = { startDate: "2026-07-10", endDate: "2026-08-08" };
const policy: RevenueSourceFreshnessPolicyV1 = { WOO: 24, GA4: 24, META: 24 };

function revenueInput(): RevenueDecisionPacketInputV1 {
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
          orders: 60,
          averageOrderValueCents: 1_333,
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
        evidenceRefs: ["evidence:woo:matched-periods"],
      },
      {
        source: "GA4",
        truthState: "CURRENT",
        observedAt: "2026-09-08T09:05:00Z",
        current: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: 950,
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
        evidenceRefs: ["evidence:ga4:matched-periods"],
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
          spendCents: 25_000,
          attributedPurchaseValueCents: 40_000,
        },
        previous: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: null,
          spendCents: 25_000,
          attributedPurchaseValueCents: 45_000,
        },
        evidenceRefs: ["evidence:meta:matched-periods"],
      },
    ],
  };
}

test("accepts all three still-current sources and preserves safety boundaries", () => {
  const result = revalidateRevenueSourceFreshnessV1(
    revenueInput(),
    "2026-09-08T12:00:00Z",
    policy,
  );

  assert.equal(result.status, "READY");
  assert.equal(result.reasonCode, "ALL_SOURCES_CURRENT");
  assert.ok(result.acceptedInput);
  assert.equal(result.acceptedInput?.generatedAt, "2026-09-08T12:00:00Z");
  assert.deepEqual(result.sourceStatus.map((item) => item.decisionTruthState), [
    "CURRENT",
    "CURRENT",
    "CURRENT",
  ]);
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.expectedLift, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.externalMutationAllowed, false);
  assert.equal(result.metaWriteAllowed, false);
  assert.equal(result.approvalBypassAllowed, false);

  const packet = buildRevenueDecisionPacketV1(result.acceptedInput!);
  assert.equal(packet.status, "READY_FOR_DECISION");
});

test("withholds the decision input when a once-current source ages past its policy", () => {
  const result = revalidateRevenueSourceFreshnessV1(
    revenueInput(),
    "2026-09-10T12:00:00Z",
    policy,
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "SOURCE_EVIDENCE_NOT_CURRENT");
  assert.equal(result.acceptedInput, null);
  assert.deepEqual(result.sourceStatus.map((item) => item.decisionTruthState), [
    "STALE",
    "STALE",
    "STALE",
  ]);
  assert.ok(result.limitations.every((value) => value.includes("STALE")));
});

test("applies source-specific freshness limits without inventing a default", () => {
  const result = revalidateRevenueSourceFreshnessV1(
    revenueInput(),
    "2026-09-08T12:00:00Z",
    { WOO: 24, GA4: 24, META: 2 },
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.acceptedInput, null);
  assert.deepEqual(result.sourceStatus.map((item) => [item.source, item.decisionTruthState]), [
    ["WOO", "CURRENT"],
    ["GA4", "CURRENT"],
    ["META", "STALE"],
  ]);
});

test("never upgrades upstream partial evidence merely because it is recent", () => {
  const input = revenueInput();
  input.observations[1].truthState = "PARTIAL";

  const result = revalidateRevenueSourceFreshnessV1(
    input,
    "2026-09-08T12:00:00Z",
    policy,
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.acceptedInput, null);
  assert.equal(result.sourceStatus[1].inputTruthState, "PARTIAL");
  assert.equal(result.sourceStatus[1].decisionTruthState, "PARTIAL");
});

test("fails closed on a future source observation", () => {
  const input = revenueInput();
  input.observations[2].observedAt = "2026-09-08T13:00:00Z";
  input.generatedAt = "2026-09-08T14:00:00Z";

  const result = revalidateRevenueSourceFreshnessV1(
    input,
    "2026-09-08T12:00:00Z",
    policy,
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "FUTURE_PACKET_GENERATION");
  assert.equal(result.acceptedInput, null);
});

test("fails closed on a future observation even when packet generation is not future", () => {
  const input = revenueInput();
  input.observations[2].observedAt = "2026-09-08T12:30:00Z";
  input.generatedAt = "2026-09-08T11:00:00Z";

  const result = revalidateRevenueSourceFreshnessV1(
    input,
    "2026-09-08T12:00:00Z",
    policy,
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "FUTURE_SOURCE_OBSERVATION");
  assert.equal(result.acceptedInput, null);
  assert.equal(result.sourceStatus.find((item) => item.source === "META")?.decisionTruthState, "CONFLICTED");
});

test("rejects invalid freshness policy and invalid evaluation time", () => {
  const badPolicy = revalidateRevenueSourceFreshnessV1(
    revenueInput(),
    "2026-09-08T12:00:00Z",
    { WOO: 24, GA4: 0, META: 24 },
  );
  assert.equal(badPolicy.status, "NOT_READY");
  assert.equal(badPolicy.reasonCode, "INVALID_FRESHNESS_POLICY");

  const badTime = revalidateRevenueSourceFreshnessV1(
    revenueInput(),
    "2026-09-08 12:00:00",
    policy,
  );
  assert.equal(badTime.status, "NOT_READY");
  assert.equal(badTime.reasonCode, "INVALID_EVALUATION_TIME");
});

test("does not mutate the canonical revenue input", () => {
  const input = revenueInput();
  const before = JSON.stringify(input);

  revalidateRevenueSourceFreshnessV1(input, "2026-09-08T12:00:00Z", policy);

  assert.equal(JSON.stringify(input), before);
});
