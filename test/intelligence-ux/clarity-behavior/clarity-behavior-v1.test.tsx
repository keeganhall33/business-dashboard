import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClarityBehaviorViewModelV1,
  normalizeClarityCommerceEventsV1,
  type ClarityBehaviorInputV1,
} from "../../../src/lib/clarity-behavior/view-model-v1";

function readyInput(overrides: Partial<ClarityBehaviorInputV1> = {}): ClarityBehaviorInputV1 {
  return {
    sourceTruth: "COMPLETE",
    requestedRange: {
      current: { startDate: "2026-09-05", endDate: "2026-09-11" },
      prior: { startDate: "2026-08-29", endDate: "2026-09-04" },
    },
    observedRange: {
      current: { startDate: "2026-09-05", endDate: "2026-09-11" },
      prior: { startDate: "2026-08-29", endDate: "2026-09-04" },
    },
    current: {
      sessions: 400,
      uniqueUsers: 300,
      pagesPerSession: 3,
      scrollDepthPercent: 66,
      activeTimeSeconds: 50,
      rageClickSessions: 8,
      deadClickSessions: 64,
      excessiveScrollSessions: 10,
      quickBackSessions: 64,
      purchaseSessions: 2,
    },
    prior: {
      sessions: 400,
      uniqueUsers: 310,
      pagesPerSession: 3.1,
      scrollDepthPercent: 61,
      activeTimeSeconds: 70,
      rageClickSessions: 6,
      deadClickSessions: 30,
      excessiveScrollSessions: 8,
      quickBackSessions: 50,
      purchaseSessions: 1,
    },
    freshness: {
      extractedAt: "2026-09-12T08:00:00Z",
      completeThrough: "2026-09-11",
      now: "2026-09-12T10:00:00Z",
      maxAgeHours: 24,
    },
    ...overrides,
  };
}

test("complete matched evidence generates threshold findings without causal claims or write authority", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput());

  assert.equal(model.state, "READY");
  assert.equal(model.decisionGrade, true);
  assert.ok(model.findings.some((finding) => finding.id === "DEAD_CLICK_RATE" && finding.severity === "CRITICAL"));
  assert.ok(model.findings.some((finding) => finding.id === "DEAD_CLICK_REGRESSION"));
  assert.ok(model.findings.some((finding) => finding.id === "QUICK_BACK_RATE"));
  assert.ok(model.findings.some((finding) => finding.id === "ACTIVE_TIME_DECLINE"));
  assert.ok(model.findings.every((finding) => finding.causalClaim === false));
  assert.ok(model.findings.every((finding) => finding.externalMutationAllowed === false));
  assert.ok(model.findings.every((finding) => finding.requiresApproval === true));
  assert.match(model.attributionNote, /does not establish conversion causality/i);
  assert.match(model.attributionNote, /no external mutation authority/i);
});

test("missing behavioral evidence stays unknown instead of silently becoming zero", () => {
  const input = readyInput();
  const model = buildClarityBehaviorViewModelV1({
    ...input,
    current: { ...input.current, deadClickSessions: undefined },
  });

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.equal(model.metrics.deadClickRate.current, null);
  assert.deepEqual(model.findings, []);
  assert.ok(model.truthNotes.some((note) => /missing or invalid/i.test(note)));
});

test("conflicted source evidence fails closed and suppresses findings", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({ sourceTruth: "CONFLICTED" }));

  assert.equal(model.state, "CONFLICTED");
  assert.equal(model.decisionGrade, false);
  assert.deepEqual(model.findings, []);
  assert.ok(model.truthNotes.some((note) => /conflicted/i.test(note)));
});

test("stale extraction fails closed even when metric payload is otherwise complete", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({
    freshness: {
      extractedAt: "2026-09-10T08:00:00Z",
      completeThrough: "2026-09-11",
      now: "2026-09-12T10:00:00Z",
      maxAgeHours: 24,
    },
  }));

  assert.equal(model.state, "STALE");
  assert.equal(model.decisionGrade, false);
  assert.deepEqual(model.findings, []);
  assert.ok(model.truthNotes.some((note) => /freshness limit/i.test(note)));
});

test("mismatched reporting windows remain partial and do not compare unlike periods", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({
    observedRange: {
      current: { startDate: "2026-09-06", endDate: "2026-09-11" },
      prior: { startDate: "2026-08-29", endDate: "2026-09-04" },
    },
  }));

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.deepEqual(model.findings, []);
  assert.ok(model.truthNotes.some((note) => /do not exactly match/i.test(note)));
});

test("incomplete current range is partial even if source says complete", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({
    freshness: {
      extractedAt: "2026-09-12T08:00:00Z",
      completeThrough: "2026-09-10",
      now: "2026-09-12T10:00:00Z",
      maxAgeHours: 24,
    },
  }));

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.deepEqual(model.findings, []);
  assert.ok(model.truthNotes.some((note) => /complete only through 2026-09-10/i.test(note)));
});

test("duplicate commerce event aliases are deduplicated by session and canonical stage", () => {
  const funnel = normalizeClarityCommerceEventsV1([
    { sessionId: "s1", eventName: "Product viewed" },
    { sessionId: "s1", eventName: "Add to cart" },
    { sessionId: "s1", eventName: "kh_add_to_cart" },
    { sessionId: "s1", eventName: "Checkout" },
    { sessionId: "s1", eventName: "Begin checkout" },
    { sessionId: "s1", eventName: "kh_checkout_entry" },
    { sessionId: "s1", eventName: "Purchase" },
    { sessionId: "s2", eventName: "Add to cart" },
    { sessionId: "s2", eventName: "kh_add_to_cart" },
    { sessionId: "s2", eventName: "unmapped event" },
    { sessionId: null, eventName: "Purchase" },
  ]);

  assert.deepEqual(funnel.counts, {
    PRODUCT_VIEW: 1,
    ADD_TO_CART: 2,
    CHECKOUT: 1,
    PURCHASE: 1,
  });
  assert.equal(funnel.recognizedEvents, 9);
  assert.equal(funnel.deduplicatedEvents, 4);
  assert.equal(funnel.ignoredEvents, 2);
  assert.equal(funnel.sessionsWithRecognizedEvents, 2);
});

test("zero prior rate does not fabricate an infinite regression percentage", () => {
  const input = readyInput();
  const model = buildClarityBehaviorViewModelV1({
    ...input,
    prior: { ...input.prior, deadClickSessions: 0 },
  });

  assert.equal(model.metrics.deadClickRate.prior, 0);
  assert.equal(model.metrics.deadClickRate.deltaPercent, null);
  assert.ok(!model.findings.some((finding) => finding.id === "DEAD_CLICK_REGRESSION"));
});
