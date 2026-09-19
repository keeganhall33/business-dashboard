import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// @ts-expect-error The production entry point is intentionally plain ESM.
import { runProductionRevenueDecisionLoopV1 } from "../../../scripts/run-production-revenue-decision-loop.mjs";

const script = new URL(
  "../../../scripts/run-production-revenue-decision-loop.mjs",
  import.meta.url,
);

type Metrics = {
  revenueCents: number | null;
  orders: number | null;
  averageOrderValueCents: number | null;
  sessions: number | null;
  spendCents: number | null;
  attributedPurchaseValueCents: number | null;
};

const metrics = (overrides: Partial<Metrics> = {}): Metrics => ({
  revenueCents: null,
  orders: null,
  averageOrderValueCents: null,
  sessions: null,
  spendCents: null,
  attributedPurchaseValueCents: null,
  ...overrides,
});

const observation = (
  source: "WOO" | "GA4" | "META",
  current: Partial<Metrics>,
  previous: Partial<Metrics>,
  truthState: "CURRENT" | "PARTIAL" | "STALE" | "UNKNOWN" | "CONFLICTED" = "CURRENT",
  observedAt = "2026-09-13T20:00:00.000Z",
) => ({
  source,
  truthState,
  observedAt,
  current: metrics(current),
  previous: metrics(previous),
  evidenceRefs: [`${source.toLowerCase()}:matched-period`],
});

const input = () => ({
  generatedAt: "2026-09-13T23:00:00.000Z",
  evaluatedAt: "2026-09-13T23:00:00.000Z",
  freshnessPolicy: { WOO: 6, GA4: 6, META: 6 },
  currentRange: { startDate: "2026-08-14", endDate: "2026-09-12" },
  comparisonRange: { startDate: "2026-07-15", endDate: "2026-08-13" },
  observations: [
    observation(
      "WOO",
      { revenueCents: 120_000, orders: 100, averageOrderValueCents: 1_200 },
      { revenueCents: 100_000, orders: 100, averageOrderValueCents: 1_000 },
    ),
    observation("GA4", { sessions: 1_000 }, { sessions: 1_000 }),
    observation(
      "META",
      { spendCents: 30_000, attributedPurchaseValueCents: 60_000 },
      { spendCents: 30_000, attributedPurchaseValueCents: 50_000 },
    ),
  ],
});

test("executes one fresh bounded approval-gated decision with a baseline and evaluation window", () => {
  const run = runProductionRevenueDecisionLoopV1(input());

  assert.equal(run.contractVersion, "PRODUCTION_REVENUE_DECISION_LOOP_RUN_V2");
  assert.equal(run.status, "READY");
  assert.equal(run.reasonCode, "FRESH_REVENUE_DECISION_READY");
  assert.equal(run.sourceFreshness.status, "READY");
  assert.ok(run.packet);
  assert.equal(run.packet.status, "READY_FOR_DECISION");
  assert.equal(run.packet.primaryDriver.driver, "ORDER_VALUE");
  assert.match(run.packet.primaryDriver.statement, /not a proven cause/);
  assert.equal(run.packet.recommendedAction.approvalClass, "KEEGAN_APPROVAL_REQUIRED");
  assert.equal(run.packet.recommendedAction.executesMutation, false);
  assert.equal(run.packet.measurement.baseline, 1_200);
  assert.deepEqual(run.packet.measurement.evaluationWindow, {
    startDate: "2026-09-13",
    endDate: "2026-09-26",
  });
  assert.deepEqual(run.authority, {
    causalClaimAllowed: false,
    revenueAttributionAllowed: false,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    approvalBypassAllowed: false,
  });
  assert.equal(run.externalMutationPerformed, false);
});

test("withholds a packet when CURRENT source evidence has aged past the explicit decision-time policy", () => {
  const staleByAge = input();
  staleByAge.observations[2].observedAt = "2026-09-13T10:00:00.000Z";

  const run = runProductionRevenueDecisionLoopV1(staleByAge);

  assert.equal(run.status, "NOT_READY");
  assert.equal(run.reasonCode, "SOURCE_FRESHNESS_NOT_READY");
  assert.equal(run.sourceFreshness.status, "NOT_READY");
  assert.equal(run.sourceFreshness.reasonCode, "SOURCE_EVIDENCE_NOT_CURRENT");
  assert.equal(run.packet, null);
  const meta = run.sourceFreshness.sourceStatus.find(
    (item: { source: string }) => item.source === "META",
  );
  assert.ok(meta);
  assert.equal(meta.inputTruthState, "CURRENT");
  assert.equal(meta.decisionTruthState, "STALE");
  assert.equal(run.externalMutationPerformed, false);
});

test("preserves partial or conflicted upstream truth and never manufactures a packet", () => {
  const partial = input();
  partial.observations[2].truthState = "PARTIAL";
  const partialRun = runProductionRevenueDecisionLoopV1(partial);
  assert.equal(partialRun.status, "NOT_READY");
  assert.equal(partialRun.packet, null);

  const conflicted = input();
  conflicted.observations[1].truthState = "CONFLICTED";
  const conflictedRun = runProductionRevenueDecisionLoopV1(conflicted);
  assert.equal(conflictedRun.status, "NOT_READY");
  assert.equal(conflictedRun.packet, null);
  assert.equal(conflictedRun.authority.causalClaimAllowed, false);
  assert.equal(conflictedRun.authority.revenueAttributionAllowed, false);
});

test("requires an explicit valid freshness policy instead of inventing a default", () => {
  const invalidPolicy = input();
  invalidPolicy.freshnessPolicy.META = 0;

  const run = runProductionRevenueDecisionLoopV1(invalidPolicy);

  assert.equal(run.status, "NOT_READY");
  assert.equal(run.reasonCode, "SOURCE_FRESHNESS_NOT_READY");
  assert.equal(run.sourceFreshness.reasonCode, "INVALID_FRESHNESS_POLICY");
  assert.equal(run.packet, null);
});

test("rejects caller-supplied causality, action, execution, and hidden-policy fields", () => {
  for (const unsupported of [
    { claimedCause: "Meta spend" },
    { recommendedAction: { description: "Increase spend" } },
    { execute: true },
    { defaultFreshnessHours: 24 },
  ]) {
    const run = runProductionRevenueDecisionLoopV1({ ...input(), ...unsupported });
    assert.equal(run.status, "NOT_READY");
    assert.equal(run.reasonCode, "INPUT_REJECTED");
    assert.equal(run.packet, null);
    assert.equal(run.externalMutationPerformed, false);
  }
});

test("rejects impossible future decision chronology before exposing a packet", () => {
  const futurePacket = input();
  futurePacket.evaluatedAt = "2026-09-13T22:59:59.000Z";

  const run = runProductionRevenueDecisionLoopV1(futurePacket);

  assert.equal(run.status, "CONFLICTED");
  assert.equal(run.reasonCode, "SOURCE_FRESHNESS_CONFLICTED");
  assert.equal(run.sourceFreshness.reasonCode, "FUTURE_PACKET_GENERATION");
  assert.equal(run.packet, null);
});

test("is deterministic, immutable, and does not mutate input", () => {
  const value = input();
  const before = structuredClone(value);
  const first = runProductionRevenueDecisionLoopV1(value);
  const second = runProductionRevenueDecisionLoopV1(structuredClone(value));

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.packet));
  assert.ok(Object.isFrozen(first.sourceFreshness));
  assert.ok(Object.isFrozen(first.limitations));
  assert.ok(Object.isFrozen(first.authority));
  assert.equal(JSON.stringify(first).match(/\"recommendedAction\"/g)?.length, 1);
});

test("CLI consumes fresh canonical evidence from stdin and emits only a read-only packet", () => {
  const result = spawnSync(process.execPath, [script.pathname], {
    input: JSON.stringify(input()),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /Error|Unhandled|unhandled/);
  const run = JSON.parse(result.stdout);
  assert.equal(run.status, "READY");
  assert.equal(run.packet.status, "READY_FOR_DECISION");
  assert.equal(run.externalMutationPerformed, false);
  assert.equal(run.authority.metaWriteAllowed, false);
  assert.doesNotMatch(
    result.stdout,
    /mutationPerformed\":true|outreachSent|spendChanged|priceChanged|checkoutChanged|siteChanged/,
  );
});

test("CLI reports stale evidence without leaking it into a decision packet", () => {
  const stale = input();
  stale.observations[0].observedAt = "2026-09-12T12:00:00.000Z";
  const result = spawnSync(process.execPath, [script.pathname], {
    input: JSON.stringify(stale),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const run = JSON.parse(result.stdout);
  assert.equal(run.status, "NOT_READY");
  assert.equal(run.packet, null);
  assert.equal(run.sourceFreshness.reasonCode, "SOURCE_EVIDENCE_NOT_CURRENT");
});

test("CLI fails closed on invalid or unbounded input without leaking raw input", () => {
  const secret = "never-echo-this-value";
  const invalid = spawnSync(process.execPath, [script.pathname], {
    input: JSON.stringify({ secret }),
    encoding: "utf8",
  });

  assert.equal(invalid.status, 2);
  assert.doesNotMatch(invalid.stdout, new RegExp(secret));
  const run = JSON.parse(invalid.stdout);
  assert.equal(run.status, "NOT_READY");
  assert.equal(run.reasonCode, "INPUT_REJECTED");
  assert.equal(run.packet, null);
  assert.equal(run.externalMutationPerformed, false);

  const oversized = spawnSync(process.execPath, [script.pathname], {
    input: JSON.stringify({ value: "x".repeat(1024 * 1024) }),
    encoding: "utf8",
  });
  assert.equal(oversized.status, 2);
  assert.equal(JSON.parse(oversized.stdout).reasonCode, "INPUT_TOO_LARGE");
});
