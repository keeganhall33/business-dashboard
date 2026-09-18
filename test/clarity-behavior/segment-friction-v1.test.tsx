import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClaritySegmentFrictionV1,
  type ClaritySegmentFrictionInputV1,
  type ClaritySegmentObservationV1,
} from "@/lib/clarity-behavior/segment-friction-v1";

const CURRENT = { startDate: "2026-08-16", endDate: "2026-09-14" };
const PRIOR = { startDate: "2026-07-17", endDate: "2026-08-15" };

function row(overrides: Partial<ClaritySegmentObservationV1> = {}): ClaritySegmentObservationV1 {
  return {
    dimension: "PAGE",
    segmentRef: "page:shop",
    label: "/shop",
    current: { sessions: 100, deadClickSessions: 20, quickBackSessions: 10 },
    prior: { sessions: 100, deadClickSessions: 5, quickBackSessions: 8 },
    evidenceRefs: ["clarity:segment:page:shop:current-prior"],
    ...overrides,
  };
}

function input(overrides: Partial<ClaritySegmentFrictionInputV1> = {}): ClaritySegmentFrictionInputV1 {
  return {
    source: "MICROSOFT_CLARITY_DATA_EXPORT_API",
    sourceTruth: "COMPLETE",
    currentRange: { ...CURRENT },
    priorRange: { ...PRIOR },
    observedCurrentRange: { ...CURRENT },
    observedPriorRange: { ...PRIOR },
    extractedAt: "2026-09-15T10:00:00.000Z",
    completeThrough: "2026-09-14",
    evaluatedAt: "2026-09-15T12:00:00.000Z",
    maxAgeHours: 24,
    coverageComplete: true,
    rows: [row()],
    ...overrides,
  };
}

test("builds a deterministic friction leaderboard without causal or mutation authority", () => {
  const source = input({
    rows: [
      row(),
      row({
        dimension: "BROWSER",
        segmentRef: "browser:safari",
        label: "Safari",
        current: { sessions: 100, deadClickSessions: 5, quickBackSessions: 20 },
        prior: { sessions: 100, deadClickSessions: 5, quickBackSessions: 8 },
        evidenceRefs: ["clarity:segment:browser:safari:current-prior"],
      }),
      row({
        dimension: "TRAFFIC_SOURCE",
        segmentRef: "source:direct",
        label: "Direct",
        current: { sessions: 100, deadClickSessions: 2, quickBackSessions: 3 },
        prior: { sessions: 100, deadClickSessions: 2, quickBackSessions: 3 },
        evidenceRefs: ["clarity:segment:source:direct:current-prior"],
      }),
      row({
        dimension: "DEVICE",
        segmentRef: "device:mobile",
        label: "Mobile",
        current: { sessions: 10, deadClickSessions: 5, quickBackSessions: 4 },
        prior: { sessions: 100, deadClickSessions: 5, quickBackSessions: 8 },
        evidenceRefs: ["clarity:segment:device:mobile:current-prior"],
      }),
    ],
  });
  const before = structuredClone(source);

  const result = buildClaritySegmentFrictionV1(source);

  assert.equal(result.state, "READY");
  assert.equal(result.reasonCode, "SEGMENT_FRICTION_READY");
  assert.deepEqual(source, before);
  assert.deepEqual(
    result.leaderboard.map((item) => [item.rank, item.segmentRef, item.severity]),
    [
      [1, "page:shop", "CRITICAL"],
      [2, "browser:safari", "HIGH"],
      [3, "source:direct", "NONE"],
      [4, "device:mobile", "LOW_SAMPLE"],
    ],
  );
  assert.equal(result.leaderboard[0]?.deadClickRate.current, 0.2);
  assert.equal(result.leaderboard[0]?.deadClickRate.prior, 0.05);
  assert.equal(result.leaderboard[0]?.deadClickRate.regression2x, true);
  assert.equal(result.leaderboard[1]?.quickBackRate.current, 0.2);
  assert.equal(result.leaderboard[3]?.nextStep, "GATHER_MORE_OBSERVATIONS");
  assert.equal(result.authority.causalClaimAllowed, false);
  assert.equal(result.authority.revenueAttributionAllowed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.ok(result.limitations.some((value) => value.includes("does not establish causal impact")));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.leaderboard));
  assert.ok(Object.isFrozen(result.leaderboard[0]));
});

test("does not classify a high-rate low-volume segment as an alert", () => {
  const result = buildClaritySegmentFrictionV1(input({
    rows: [row({
      current: { sessions: 8, deadClickSessions: 7, quickBackSessions: 7 },
      prior: { sessions: 8, deadClickSessions: 1, quickBackSessions: 1 },
    })],
  }));

  assert.equal(result.state, "READY");
  assert.equal(result.leaderboard[0]?.severity, "LOW_SAMPLE");
  assert.equal(result.leaderboard[0]?.sampleState, "LOW_SAMPLE");
  assert.equal(result.leaderboard[0]?.nextStep, "GATHER_MORE_OBSERVATIONS");
  assert.match(result.leaderboard[0]?.facts[0] ?? "", /alert classification is withheld/i);
});

test("fails closed when source truth is partial or segment coverage is incomplete", () => {
  const partial = buildClaritySegmentFrictionV1(input({ sourceTruth: "PARTIAL" }));
  const incomplete = buildClaritySegmentFrictionV1(input({ coverageComplete: false }));

  assert.equal(partial.state, "WITHHELD");
  assert.equal(partial.reasonCode, "SOURCE_NOT_COMPLETE");
  assert.deepEqual(partial.leaderboard, []);
  assert.equal(incomplete.state, "WITHHELD");
  assert.equal(incomplete.reasonCode, "COVERAGE_INCOMPLETE");
  assert.deepEqual(incomplete.evidenceRefs, []);
});

test("fails closed on stale or future extraction evidence", () => {
  const stale = buildClaritySegmentFrictionV1(input({
    extractedAt: "2026-09-14T00:00:00.000Z",
    completeThrough: "2026-09-14",
    evaluatedAt: "2026-09-15T12:00:00.000Z",
    maxAgeHours: 12,
  }));
  const future = buildClaritySegmentFrictionV1(input({
    extractedAt: "2026-09-15T13:00:00.000Z",
    evaluatedAt: "2026-09-15T12:00:00.000Z",
  }));

  assert.equal(stale.reasonCode, "STALE_EVIDENCE");
  assert.equal(future.reasonCode, "FUTURE_EVIDENCE");
  assert.equal(stale.state, "WITHHELD");
  assert.equal(future.state, "WITHHELD");
});

test("requires exact matched adjacent ranges and complete current coverage", () => {
  const mismatch = buildClaritySegmentFrictionV1(input({
    observedCurrentRange: { startDate: "2026-08-17", endDate: "2026-09-14" },
  }));
  const incomplete = buildClaritySegmentFrictionV1(input({
    completeThrough: "2026-09-13",
  }));

  assert.equal(mismatch.reasonCode, "RANGE_MISMATCH");
  assert.equal(incomplete.reasonCode, "INCOMPLETE_CURRENT_RANGE");
});

test("rejects duplicate segment identities and impossible affected-session counts", () => {
  const duplicate = row();
  const duplicateResult = buildClaritySegmentFrictionV1(input({ rows: [row(), duplicate] }));
  const impossibleResult = buildClaritySegmentFrictionV1(input({
    rows: [row({ current: { sessions: 10, deadClickSessions: 11, quickBackSessions: 1 } })],
  }));

  assert.equal(duplicateResult.reasonCode, "INVALID_INPUT");
  assert.equal(impossibleResult.reasonCode, "INVALID_INPUT");
  assert.deepEqual(duplicateResult.leaderboard, []);
  assert.deepEqual(impossibleResult.leaderboard, []);
});

test("requires path-only page labels and privacy-safe evidence references", () => {
  const queryPage = buildClaritySegmentFrictionV1(input({
    rows: [row({ label: "/shop?email=someone@example.com" })],
  }));
  const secretRef = buildClaritySegmentFrictionV1(input({
    rows: [row({ evidenceRefs: ["access_token=super-secret-value"] })],
  }));

  assert.equal(queryPage.reasonCode, "INVALID_INPUT");
  assert.equal(secretRef.reasonCode, "INVALID_INPUT");
});

test("keeps unknown friction metrics unknown rather than zero-filling", () => {
  const result = buildClaritySegmentFrictionV1(input({
    rows: [row({
      current: { sessions: 100, deadClickSessions: null, quickBackSessions: null },
      prior: { sessions: 100, deadClickSessions: null, quickBackSessions: null },
    })],
  }));

  assert.equal(result.state, "READY");
  assert.equal(result.leaderboard[0]?.deadClickRate.current, null);
  assert.equal(result.leaderboard[0]?.quickBackRate.current, null);
  assert.equal(result.leaderboard[0]?.severity, "NONE");
  assert.deepEqual(result.leaderboard[0]?.facts, []);
});
