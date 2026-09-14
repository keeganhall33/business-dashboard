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
) => ({
  source,
  truthState,
  observedAt: "2026-09-13T20:00:00.000Z",
  current: metrics(current),
  previous: metrics(previous),
  evidenceRefs: [`${source.toLowerCase()}:matched-period`],
});

const input = () => ({
  generatedAt: "2026-09-13T23:00:00.000Z",
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

test("executes one bounded, approval-gated decision with a baseline and evaluation window", () => {
  const run = runProductionRevenueDecisionLoopV1(input());

  assert.equal(run.contractVersion, "PRODUCTION_REVENUE_DECISION_LOOP_RUN_V1");
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
  assert.equal(run.externalMutationPerformed, false);
});

test("truthfully withholds a consequential action for missing or stale evidence", () => {
  const missing = input();
  missing.observations = missing.observations.filter((item) => item.source !== "META");
  const missingRun = runProductionRevenueDecisionLoopV1(missing);
  assert.equal(missingRun.packet.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(
    missingRun.packet.sourceCoverage.map((item: { source: string; truthState: string }) => [item.source, item.truthState]),
    [["WOO", "CURRENT"], ["GA4", "CURRENT"], ["META", "UNKNOWN"]],
  );
  assert.equal(missingRun.packet.recommendedAction.approvalClass, "AUTO_CONTINUE");

  const stale = input();
  stale.observations[2].truthState = "STALE";
  const staleRun = runProductionRevenueDecisionLoopV1(stale);
  assert.equal(staleRun.packet.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(staleRun.packet.limitations, ["META coverage is STALE."]);
});

test("preserves conflicting evidence and unsupported causality as UNKNOWN", () => {
  const conflicted = input();
  conflicted.observations[1].truthState = "CONFLICTED";
  const run = runProductionRevenueDecisionLoopV1(conflicted);

  assert.equal(run.packet.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(run.packet.primaryDriver.state, "UNKNOWN");
  assert.deepEqual(run.packet.conflictingEvidence, ["GA4 evidence is conflicted."]);
  assert.equal(run.packet.measurement.evaluationWindow, null);
  assert.equal(run.externalMutationPerformed, false);
});

test("rejects caller-supplied causality, action, and execution fields", () => {
  for (const unsupported of [
    { claimedCause: "Meta spend" },
    { recommendedAction: { description: "Increase spend" } },
    { execute: true },
  ]) {
    const run = runProductionRevenueDecisionLoopV1({ ...input(), ...unsupported });
    assert.equal(run.packet.status, "INVALID_INPUT");
    assert.equal(run.externalMutationPerformed, false);
  }
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
  assert.equal(JSON.stringify(first).match(/\"recommendedAction\"/g)?.length, 1);
});

test("CLI consumes canonical evidence from stdin and emits only a read-only packet", () => {
  const result = spawnSync(process.execPath, [script.pathname], {
    input: JSON.stringify(input()),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /Error|Unhandled|unhandled/);
  const run = JSON.parse(result.stdout);
  assert.equal(run.packet.status, "READY_FOR_DECISION");
  assert.equal(run.externalMutationPerformed, false);
  assert.doesNotMatch(
    result.stdout,
    /mutationPerformed\":true|outreachSent|spendChanged|priceChanged|checkoutChanged|siteChanged/,
  );
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
  assert.equal(run.packet.status, "INVALID_INPUT");
  assert.equal(run.externalMutationPerformed, false);

  const oversized = spawnSync(process.execPath, [script.pathname], {
    input: JSON.stringify({ value: "x".repeat(1024 * 1024) }),
    encoding: "utf8",
  });
  assert.equal(oversized.status, 2);
  assert.equal(JSON.parse(oversized.stdout).reasonCode, "INPUT_TOO_LARGE");
});
