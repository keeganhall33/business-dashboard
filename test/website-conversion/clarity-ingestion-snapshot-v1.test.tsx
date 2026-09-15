import assert from "node:assert/strict";
import test from "node:test";

import type { ClarityExportPayloadV1 } from "../../src/lib/website-conversion/clarity-export-adapter-v1";
import { compileClarityIngestionSnapshotV1 } from "../../src/lib/website-conversion/clarity-ingestion-snapshot-v1";

function payload(period = "current"): ClarityExportPayloadV1 {
  const current = period === "current";
  return {
    projectId: "project-1",
    period: {
      id: period,
      startAt: current ? "2026-09-07T07:00:00Z" : "2026-08-31T07:00:00Z",
      endAt: current ? "2026-09-14T07:00:00Z" : "2026-09-07T07:00:00Z",
      timeZone: "America/Los_Angeles"
    },
    extractedAt: current ? "2026-09-14T08:00:00Z" : "2026-09-07T08:00:00Z",
    metrics: current
      ? { sessions: 100, dead_clicks: 15, quick_backs: 13, active_time: 40, purchases: 2 }
      : { sessions: 100, dead_clicks: 5, quick_backs: 5, active_time: 100, purchases: 1 },
    smartEvents: current
      ? [
          { observationId: "cart-1", name: "Add to cart", count: 9, segment: { device: "Mobile" }, recordingLinks: ["https://clarity.microsoft.com/projects/view/project-1"] },
          { observationId: "cart-1", name: "kh_add_to_cart", count: 9 },
          { observationId: "buy-1", name: "Purchase", count: 2 }
        ]
      : [],
    dimensions: current ? { PAGE: [{ value: "/shop", count: 80 }], DEVICE: [{ value: "Mobile", count: 60 }] } : undefined
  };
}

const now = "2026-09-14T09:00:00Z";

test("compiles a canonical snapshot with behavioral findings and evidence", () => {
  const result = compileClarityIngestionSnapshotV1({ current: payload(), prior: payload("prior"), now, staleAfterHours: 240 });
  assert.equal(result.contractVersion, "ClarityIngestionSnapshotV1");
  assert.equal(result.metrics.SESSIONS.value, 100);
  assert.equal(result.funnel.find((stage) => stage.stage === "ADD_TO_CART")?.count, 9);
  assert.deepEqual(result.findings.map((finding) => finding.reasonCode), [
    "DEAD_CLICK_RATE",
    "ACTIVE_TIME_REGRESSION",
    "DEAD_CLICK_DOUBLING",
    "QUICK_BACK_RATE"
  ]);
  assert.equal(result.evidenceRefs.some((ref) => ref.includes(":dimension:PAGE:")), true);
  assert.deepEqual(result.recordingLinks, ["https://clarity.microsoft.com/projects/view/project-1"]);
});

test("preserves Pacific reporting windows and partial-day source state", () => {
  const current = payload();
  current.period.partialDay = true;
  current.sourceStatus = { state: "PARTIAL", reason: "Pacific day is incomplete" };
  const result = compileClarityIngestionSnapshotV1({ current, now });
  assert.deepEqual(result.reportingWindow, {
    startAt: "2026-09-07T07:00:00.000Z",
    endAt: "2026-09-14T07:00:00.000Z",
    timeZone: "America/Los_Angeles",
    partialDay: true
  });
  assert.equal(result.sourceState, "PARTIAL");
  assert.equal(result.sourceReason, "Pacific day is incomplete");
});

test("keeps stale and unavailable states explicit", () => {
  const stale = compileClarityIngestionSnapshotV1({ current: payload(), now: "2026-09-20T09:00:00Z" });
  assert.equal(stale.sourceState, "STALE");
  const unavailable = payload();
  unavailable.sourceStatus = { state: "UNAVAILABLE", reason: "Export missing" };
  unavailable.metrics = {};
  const result = compileClarityIngestionSnapshotV1({ current: unavailable, now });
  assert.equal(result.sourceState, "UNAVAILABLE");
  assert.equal(result.metrics.SESSIONS.value, null);
  assert.equal(result.metrics.SESSIONS.sourceState, "UNKNOWN");
});

test("isolates malformed fragments while retaining valid observations", () => {
  const current = payload();
  current.metrics = { sessions: 12, dead_clicks: "invalid" };
  current.smartEvents = [
    { name: "Purchase", count: "two" },
    { observationId: "valid", name: "Purchase", count: 1, recordingLinks: ["javascript:alert(1)"] }
  ];
  const result = compileClarityIngestionSnapshotV1({ current, now });
  assert.equal(result.metrics.SESSIONS.value, 12);
  assert.equal(result.metrics.DEAD_CLICKS.sourceState, "UNAVAILABLE");
  assert.equal(result.funnel.find((stage) => stage.stage === "PURCHASE")?.count, 1);
  assert.deepEqual(new Set(result.issues.map((issue) => issue.reasonCode)), new Set(["MALFORMED_FRAGMENT", "UNSAFE_LINK"]));
});

test("deduplicates event aliases and retains dimensions, segments, and safe links", () => {
  const result = compileClarityIngestionSnapshotV1({ current: payload(), now });
  assert.equal(result.funnel.find((stage) => stage.stage === "ADD_TO_CART")?.count, 9);
  assert.deepEqual(result.segments, [{ device: "Mobile" }]);
  assert.deepEqual(result.dimensions.map((row) => `${row.kind}:${row.value}`), ["DEVICE:Mobile", "PAGE:/shop"]);
  assert.equal(result.recordingLinks.length, 1);
});

test("produces deterministic identity and does not mutate source payloads", () => {
  const current = payload();
  const prior = payload("prior");
  const before = structuredClone({ current, prior });
  const first = compileClarityIngestionSnapshotV1({ current, prior, now, staleAfterHours: 240 });
  const second = compileClarityIngestionSnapshotV1({ current: structuredClone(current), prior: structuredClone(prior), now, staleAfterHours: 240 });
  assert.equal(first.snapshotId, second.snapshotId);
  assert.equal(first.upsertKey, second.upsertKey);
  assert.deepEqual({ current, prior }, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.metrics.SESSIONS), true);
});

test("rejects cross-project comparisons and protects source isolation", () => {
  const prior = payload("prior");
  prior.projectId = "other-project";
  assert.throws(() => compileClarityIngestionSnapshotV1({ current: payload(), prior, now }), /projectId must match/);
  const result = compileClarityIngestionSnapshotV1({ current: payload(), now });
  assert.deepEqual(result.sourceIsolation, {
    clarity: "ISOLATED",
    ga4: "UNAFFECTED",
    woo: "UNAFFECTED",
    funnelkit: "UNAFFECTED",
    meta: "UNAFFECTED"
  });
});

test("performs no external access or writes", () => {
  const result = compileClarityIngestionSnapshotV1({ current: payload(), now });
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});
