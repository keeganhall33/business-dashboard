import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClarityBehaviorViewModelV1,
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
      deadClickSessions: 64,
      quickBackSessions: 64,
    },
    prior: {
      sessions: 400,
      uniqueUsers: 310,
      pagesPerSession: 3.1,
      scrollDepthPercent: 61,
      activeTimeSeconds: 70,
      deadClickSessions: 30,
      quickBackSessions: 50,
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

function assertFailsClosed(input: ClarityBehaviorInputV1): void {
  const model = buildClarityBehaviorViewModelV1(input);
  assert.notEqual(model.state, "READY");
  assert.equal(model.decisionGrade, false);
  assert.deepEqual(model.findings, []);
}

test("valid current freshness and complete calendar coverage remains decision-grade", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput());

  assert.equal(model.state, "READY");
  assert.equal(model.decisionGrade, true);
});

test("missing freshness proof cannot produce READY behavior evidence", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({ freshness: null }));

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.deepEqual(model.findings, []);
  assert.ok(model.truthNotes.some((note) => /freshness is unproven/i.test(note)));
  assert.ok(model.truthNotes.some((note) => /completethrough is missing/i.test(note)));
});

test("malformed freshness timestamps and non-positive age limits fail closed", () => {
  assertFailsClosed(readyInput({
    freshness: {
      extractedAt: "2026-02-30T08:00:00Z",
      completeThrough: "2026-09-11",
      now: "2026-09-12T10:00:00Z",
      maxAgeHours: 24,
    },
  }));

  assertFailsClosed(readyInput({
    freshness: {
      extractedAt: "2026-09-12T08:00:00Z",
      completeThrough: "2026-09-11",
      now: "2026-09-12T10:00:00Z",
      maxAgeHours: 0,
    },
  }));
});

test("future extraction timestamps cannot certify current behavior evidence", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({
    freshness: {
      extractedAt: "2026-09-12T11:00:00Z",
      completeThrough: "2026-09-11",
      now: "2026-09-12T10:00:00Z",
      maxAgeHours: 24,
    },
  }));

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.deepEqual(model.findings, []);
  assert.ok(model.truthNotes.some((note) => /after the supplied reference time/i.test(note)));
});

test("impossible requested calendar dates cannot become decision-grade even when observed strings match", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({
    requestedRange: {
      current: { startDate: "2026-09-05", endDate: "2026-09-31" },
      prior: { startDate: "2026-08-29", endDate: "2026-09-04" },
    },
    observedRange: {
      current: { startDate: "2026-09-05", endDate: "2026-09-31" },
      prior: { startDate: "2026-08-29", endDate: "2026-09-04" },
    },
    freshness: {
      extractedAt: "2026-10-01T08:00:00Z",
      completeThrough: "2026-09-31",
      now: "2026-10-01T10:00:00Z",
      maxAgeHours: 24,
    },
  }));

  assert.equal(model.state, "PARTIAL");
  assert.ok(model.truthNotes.some((note) => /requested clarity current\/prior ranges/i.test(note)));
});

test("inverted observed ranges cannot satisfy exact-window truth", () => {
  const model = buildClarityBehaviorViewModelV1(readyInput({
    observedRange: {
      current: { startDate: "2026-09-11", endDate: "2026-09-05" },
      prior: { startDate: "2026-08-29", endDate: "2026-09-04" },
    },
  }));

  assert.equal(model.state, "PARTIAL");
  assert.ok(model.truthNotes.some((note) => /invalid or do not exactly match/i.test(note)));
});

test("invalid or future-dated completeThrough cannot prove period completeness", () => {
  const invalid = buildClarityBehaviorViewModelV1(readyInput({
    freshness: {
      extractedAt: "2026-10-01T08:00:00Z",
      completeThrough: "2026-09-31",
      now: "2026-10-01T10:00:00Z",
      maxAgeHours: 24,
    },
  }));
  assert.equal(invalid.state, "PARTIAL");
  assert.ok(invalid.truthNotes.some((note) => /not a valid calendar date/i.test(note)));

  const future = buildClarityBehaviorViewModelV1(readyInput({
    freshness: {
      extractedAt: "2026-09-12T08:00:00Z",
      completeThrough: "2026-09-13",
      now: "2026-09-12T10:00:00Z",
      maxAgeHours: 24,
    },
  }));
  assert.equal(future.state, "PARTIAL");
  assert.ok(future.truthNotes.some((note) => /future-dated coverage/i.test(note)));
});
