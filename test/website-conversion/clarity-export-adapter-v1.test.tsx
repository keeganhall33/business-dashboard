import assert from "node:assert/strict";
import test from "node:test";

import { mapClarityExportV1, type ClarityExportPayloadV1 } from "../../src/lib/website-conversion/clarity-export-adapter-v1";
import { normalizeClarityBehaviorV1 } from "../../src/lib/website-conversion/clarity-behavior-normalizer-v1";

function payload(): ClarityExportPayloadV1 {
  return {
    projectId: "y9ntzyx3dk",
    period: { id: "2026-09-07/2026-09-13", startAt: "2026-09-07T07:00:00Z", endAt: "2026-09-14T07:00:00Z", timeZone: "America/Los_Angeles" },
    extractedAt: "2026-09-14T08:00:00Z",
    metrics: { sessions: 438, unique_users: 327, pages_per_session: 2.94, scroll_depth: 65.55, active_time: 54, dead_clicks: 67, quick_backs: 70, excessive_scrolls: 4, rage_clicks: 2, purchases: 2 },
    smartEvents: [
      { observationId: "view-1", name: "Product viewed", count: 215, segment: { device: "Mobile", browser: "Safari" } },
      { observationId: "cart-1", name: "Add to cart", count: 9, recordingLinks: ["https://clarity.microsoft.com/projects/view/y9ntzyx3dk"] },
      { observationId: "cart-1", name: "kh_add_to_cart", count: 9 },
      { observationId: "checkout-1", name: "Begin checkout", count: 6 },
      { observationId: "purchase-1", name: "Purchase", count: 2 }
    ],
    dimensions: { PAGE: [{ value: "/shop", count: 100 }], DEVICE: [{ value: "Mobile", count: 300 }], CHANNEL: [{ value: "Paid Social", count: 120 }] }
  };
}

const options = { now: "2026-09-14T09:00:00Z" };

test("maps supported export fields into the canonical behavioral boundary", () => {
  const result = mapClarityExportV1(payload(), options);
  assert.equal(result.period.metrics.find((metric) => metric.name === "SESSIONS")?.value, 438);
  assert.equal(result.period.events.length, 5);
  assert.equal(result.reportingWindow.timeZone, "America/Los_Angeles");
  assert.equal(result.sourceState, "AVAILABLE");
  assert.deepEqual(result.recordingLinks, ["https://clarity.microsoft.com/projects/view/y9ntzyx3dk"]);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("feeds aliases to the canonical normalizer for deduplicated funnel counts", () => {
  const mapped = mapClarityExportV1(payload(), options);
  const normalized = normalizeClarityBehaviorV1({ current: mapped.period });
  assert.equal(normalized.funnel.find((item) => item.stage === "ADD_TO_CART")?.count, 9);
  assert.equal(normalized.funnel.find((item) => item.stage === "CHECKOUT")?.count, 6);
  assert.deepEqual(normalized.segments, [{ browser: "Safari", device: "Mobile" }]);
});

test("preserves partial-day and source failure state", () => {
  const input = payload();
  input.period.partialDay = true;
  input.sourceStatus = { state: "PARTIAL", reason: "Current Pacific day is incomplete" };
  const result = mapClarityExportV1(input, options);
  assert.equal(result.reportingWindow.partialDay, true);
  assert.equal(result.sourceState, "PARTIAL");
  assert.equal(result.sourceReason, "Current Pacific day is incomplete");
  assert.ok(result.period.metrics.every((metric) => metric.sourceState === "PARTIAL"));
});

test("classifies old exports as stale deterministically", () => {
  const result = mapClarityExportV1(payload(), { now: "2026-09-17T09:00:00Z", staleAfterHours: 48 });
  assert.equal(result.sourceState, "STALE");
  assert.ok(result.period.events.every((event) => event.sourceState === "STALE"));
});

test("keeps absent and unsupported metrics explicit", () => {
  const input = payload();
  input.metrics = { sessions: 5, heat_score: 99 };
  const result = mapClarityExportV1(input, options);
  const users = result.period.metrics.find((metric) => metric.name === "USERS");
  assert.deepEqual(users, { name: "USERS", value: null, sourceState: "UNKNOWN", evidenceRef: `${result.period.metrics[0].evidenceRef.replace(/:metric:.+$/, "")}:metric:USERS` });
  assert.equal(result.issues.some((issue) => issue.reasonCode === "UNSUPPORTED_METRIC"), true);
});

test("isolates malformed metrics, events, dimensions, and unsafe links", () => {
  const input = payload();
  input.metrics = { sessions: -1, users: 20 };
  input.smartEvents = [
    { name: "Purchase", count: "two" },
    { observationId: "ok", name: "Page view", count: 10, recordingLinks: ["javascript:alert(1)"] }
  ];
  input.dimensions = { PAGE: [{ value: "", count: 1 }, { value: "/valid", count: 9 }] };
  const result = mapClarityExportV1(input, options);
  assert.equal(result.period.metrics.find((metric) => metric.name === "SESSIONS")?.sourceState, "UNAVAILABLE");
  assert.equal(result.period.metrics.find((metric) => metric.name === "USERS")?.value, 20);
  assert.equal(result.period.events.length, 1);
  assert.equal(result.dimensions.length, 1);
  assert.equal(result.recordingLinks.length, 0);
  assert.deepEqual(new Set(result.issues.map((issue) => issue.reasonCode)), new Set(["MALFORMED_FRAGMENT", "UNSAFE_LINK"]));
});

test("sorts dimensions, links, and issues deterministically", () => {
  const first = payload();
  first.dimensions = { DEVICE: [{ value: "Mobile", count: 2 }], PAGE: [{ value: "/z", count: 1 }, { value: "/a", count: 1 }] };
  first.smartEvents = [{ name: "Page view", count: 2, recordingLinks: ["https://example.com/z", "https://example.com/a"] }];
  const result = mapClarityExportV1(first, options);
  assert.deepEqual(result.dimensions.map((item) => `${item.kind}:${item.value}`), ["DEVICE:Mobile", "PAGE:/a", "PAGE:/z"]);
  assert.deepEqual(result.recordingLinks, ["https://example.com/a", "https://example.com/z"]);
});

test("does not mutate input and returns deeply frozen output", () => {
  const input = payload();
  const before = structuredClone(input);
  const result = mapClarityExportV1(input, options);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.period.metrics));
  assert.ok(Object.isFrozen(result.dimensions));
});

test("validates Pacific windows and observation caps", () => {
  const timezone = payload();
  timezone.period.timeZone = "UTC" as never;
  assert.throws(() => mapClarityExportV1(timezone, options), /America\/Los_Angeles/);
  const events = payload();
  events.smartEvents = Array.from({ length: 2_001 }, () => ({ name: "Page view", count: 1 }));
  assert.throws(() => mapClarityExportV1(events, options), /exceeds 2000/);
});
